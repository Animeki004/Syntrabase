import {
  AllowStatementNode,
  BinaryExpressionNode,
  ExpressionNode,
  LiteralNode,
  MatchStatementNode,
  MemberAccessNode,
  OperationType,
  RulesRootNode,
  UnaryExpressionNode,
} from './ast.js';

interface Token {
  type: 'IDENT' | 'STRING' | 'NUMBER' | 'PUNCT' | 'OP';
  value: string;
}

export class RulesParser {
  private tokens: Token[] = [];
  private pos = 0;

  constructor(private source: string) {
    this.tokenize();
  }

  private tokenize() {
    let i = 0;
    const s = this.source;
    while (i < s.length) {
      const c = s[i];

      // Whitespace and comments
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (c === '/' && s[i + 1] === '/') {
        i += 2;
        while (i < s.length && s[i] !== '\n') i++;
        continue;
      }

      // Strings
      if (c === '"' || c === "'") {
        const quote = c;
        let str = '';
        i++;
        while (i < s.length && s[i] !== quote) {
          if (s[i] === '\\' && i + 1 < s.length) {
            str += s[i + 1];
            i += 2;
          } else {
            str += s[i];
            i++;
          }
        }
        i++; // skip closing quote
        this.tokens.push({ type: 'STRING', value: str });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(c)) {
        let num = '';
        while (i < s.length && /[0-9.]/.test(s[i])) {
          num += s[i];
          i++;
        }
        this.tokens.push({ type: 'NUMBER', value: num });
        continue;
      }

      // Identifiers / keywords / path segments
      if (/[a-zA-Z_]/.test(c)) {
        let id = '';
        while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
          id += s[i];
          i++;
        }
        this.tokens.push({ type: 'IDENT', value: id });
        continue;
      }

      // Operators
      if (c === '&' && s[i + 1] === '&') {
        this.tokens.push({ type: 'OP', value: '&&' });
        i += 2;
        continue;
      }
      if (c === '|' && s[i + 1] === '|') {
        this.tokens.push({ type: 'OP', value: '||' });
        i += 2;
        continue;
      }
      if (c === '=' && s[i + 1] === '=') {
        this.tokens.push({ type: 'OP', value: '==' });
        i += 2;
        continue;
      }
      if (c === '!' && s[i + 1] === '=') {
        this.tokens.push({ type: 'OP', value: '!=' });
        i += 2;
        continue;
      }
      if (c === '<' && s[i + 1] === '=') {
        this.tokens.push({ type: 'OP', value: '<=' });
        i += 2;
        continue;
      }
      if (c === '>' && s[i + 1] === '=') {
        this.tokens.push({ type: 'OP', value: '>=' });
        i += 2;
        continue;
      }
      if (c === '<' || c === '>') {
        this.tokens.push({ type: 'OP', value: c });
        i++;
        continue;
      }
      if (c === '!') {
        this.tokens.push({ type: 'OP', value: '!' });
        i++;
        continue;
      }
      if (c === '=') {
        this.tokens.push({ type: 'OP', value: '=' });
        i++;
        continue;
      }

      // Punctuations: { } ( ) , ; . / : *
      if (/[{}();,.:/*]/.test(c)) {
        this.tokens.push({ type: 'PUNCT', value: c });
        i++;
        continue;
      }

      i++; // Skip unrecognized
    }
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(expectedValue?: string): Token {
    const t = this.tokens[this.pos];
    if (!t) {
      throw new Error(`Unexpected end of input`);
    }
    if (expectedValue && t.value !== expectedValue) {
      throw new Error(`Expected '${expectedValue}' but found '${t.value}' at token ${this.pos}`);
    }
    this.pos++;
    return t;
  }

  private check(value: string): boolean {
    const t = this.peek();
    return t !== undefined && t.value === value;
  }

  public parse(): RulesRootNode {
    let version = '2';
    let service = 'cloud.firestore';

    // Optional: rules_version = '2';
    if (this.check('rules_version')) {
      this.consume('rules_version');
      this.consume('=');
      const verTok = this.consume();
      version = verTok.value;
      this.consume(';');
    }

    // Optional: service <name> { ... }
    if (this.check('service')) {
      this.consume('service');
      let svcName = '';
      while (this.peek() && this.peek()!.value !== '{') {
        svcName += this.consume().value;
      }
      service = svcName;
      this.consume('{');
    }

    const matches: MatchStatementNode[] = [];
    while (this.peek() && !this.check('}')) {
      if (this.check('match')) {
        matches.push(this.parseMatch());
      } else {
        this.consume();
      }
    }

    if (this.check('}')) {
      this.consume('}');
    }

    return {
      type: 'RulesRoot',
      version,
      service,
      matches,
    };
  }

  private parseMatch(): MatchStatementNode {
    this.consume('match');

    // Read path pattern until block opening '{'
    let pathPattern = '';
    while (this.peek()) {
      const nextTok = this.peek()!;
      // A block opening '{' is followed by 'allow', 'match', or '}'
      if (nextTok.value === '{') {
        const lookahead = this.tokens[this.pos + 1];
        if (
          lookahead &&
          (lookahead.value === 'allow' || lookahead.value === 'match' || lookahead.value === '}')
        ) {
          break;
        }
      }
      pathPattern += this.consume().value;
    }

    this.consume('{');

    const allowStatements: AllowStatementNode[] = [];
    const nestedMatches: MatchStatementNode[] = [];

    while (this.peek() && !this.check('}')) {
      if (this.check('allow')) {
        allowStatements.push(this.parseAllow());
      } else if (this.check('match')) {
        nestedMatches.push(this.parseMatch());
      } else {
        this.consume();
      }
    }

    this.consume('}');

    return {
      type: 'MatchStatement',
      pathPattern,
      allowStatements,
      nestedMatches,
    };
  }

  private parseAllow(): AllowStatementNode {
    this.consume('allow');

    // Comma-separated operations (e.g. read, write)
    const operations: OperationType[] = [];
    while (this.peek() && !this.check(':')) {
      const tok = this.consume();
      if (tok.value !== ',') {
        operations.push(tok.value as OperationType);
      }
    }

    this.consume(':');
    this.consume('if');

    const condition = this.parseExpression();

    this.consume(';');

    return {
      type: 'AllowStatement',
      operations,
      condition,
    };
  }

  // Expression parsing with precedence climbing:
  // parseExpression -> parseOr -> parseAnd -> parseComparison -> parseUnary -> parsePrimary
  private parseExpression(): ExpressionNode {
    return this.parseOr();
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.check('||')) {
      this.consume('||');
      const right = this.parseAnd();
      left = {
        type: 'BinaryExpression',
        operator: '||',
        left,
        right,
      };
    }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseComparison();
    while (this.check('&&')) {
      this.consume('&&');
      const right = this.parseComparison();
      left = {
        type: 'BinaryExpression',
        operator: '&&',
        left,
        right,
      };
    }
    return left;
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseUnary();
    const opTok = this.peek();
    if (opTok && ['==', '!=', '<', '<=', '>', '>='].includes(opTok.value)) {
      const op = this.consume().value as BinaryExpressionNode['operator'];
      const right = this.parseUnary();
      return {
        type: 'BinaryExpression',
        operator: op,
        left,
        right,
      };
    }
    return left;
  }

  private parseUnary(): ExpressionNode {
    if (this.check('!')) {
      this.consume('!');
      return {
        type: 'UnaryExpression',
        operator: '!',
        argument: this.parseUnary(),
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const tok = this.consume();

    if (tok.value === '(') {
      const expr = this.parseExpression();
      this.consume(')');
      return expr;
    }

    let node: ExpressionNode;

    if (tok.value === 'true') {
      node = { type: 'Literal', value: true };
    } else if (tok.value === 'false') {
      node = { type: 'Literal', value: false };
    } else if (tok.value === 'null') {
      node = { type: 'Literal', value: null };
    } else if (tok.type === 'STRING') {
      node = { type: 'Literal', value: tok.value };
    } else if (tok.type === 'NUMBER') {
      node = { type: 'Literal', value: Number(tok.value) };
    } else {
      // Identifier
      node = { type: 'Identifier', name: tok.value };
    }

    // Member access: .field.subfield
    while (this.check('.')) {
      this.consume('.');
      const prop = this.consume().value;
      node = {
        type: 'MemberAccess',
        object: node,
        property: prop,
      };
    }

    return node;
  }
}
