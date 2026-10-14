import {
  ExpressionNode,
  MatchStatementNode,
  OperationType,
  RulesRootNode,
} from './ast.js';

export interface EvaluationContext {
  request: {
    auth: {
      uid: string;
      email?: string;
      token?: Record<string, unknown>;
    } | null;
    resource?: {
      data: Record<string, unknown>;
    };
    time: string;
    method: 'get' | 'list' | 'create' | 'update' | 'delete';
  };
  resource?: {
    data: Record<string, unknown>;
  };
  params: Record<string, string>;
}

export interface EvaluationResult {
  allowed: boolean;
  matchedRule?: string;
  reason?: string;
  evaluatedAt: string;
}

export class RulesEvaluator {
  constructor(private ast: RulesRootNode) {}

  public evaluate(path: string, context: EvaluationContext): EvaluationResult {
    const normalizedPath = this.normalizePath(path);
    const method = context.request.method;

    try {
      const matchResult = this.evaluateMatches(this.ast.matches, normalizedPath, context, '');
      if (matchResult.allowed) {
        return {
          allowed: true,
          matchedRule: matchResult.matchedRule,
          evaluatedAt: new Date().toISOString(),
        };
      }

      return {
        allowed: false,
        reason: matchResult.reason || 'No rule permitted this operation',
        evaluatedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      // Fail closed on evaluation error
      return {
        allowed: false,
        reason: `Rule evaluation failed: ${(err as Error).message}`,
        evaluatedAt: new Date().toISOString(),
      };
    }
  }

  private normalizePath(p: string): string {
    const trimmed = p.replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '/';
  }

  private evaluateMatches(
    matches: MatchStatementNode[],
    targetPath: string,
    context: EvaluationContext,
    parentPathPattern: string
  ): { allowed: boolean; matchedRule?: string; reason?: string } {
    for (const match of matches) {
      const fullPattern = this.normalizePath(`${parentPathPattern}/${match.pathPattern}`);
      const capturedParams: Record<string, string> = {};
      const isPathMatch = this.matchPattern(fullPattern, targetPath, capturedParams);

      if (isPathMatch) {
        // Merge captured params
        const mergedContext: EvaluationContext = {
          ...context,
          params: { ...context.params, ...capturedParams },
        };

        // Check allow statements in current match
        for (const allow of match.allowStatements) {
          if (this.operationMatches(allow.operations, context.request.method)) {
            const conditionAllowed = this.evaluateExpression(allow.condition, mergedContext);
            if (conditionAllowed) {
              return {
                allowed: true,
                matchedRule: `match ${fullPattern} { allow ${allow.operations.join(', ')} }`,
              };
            }
          }
        }

        // Recurse into nested matches
        if (match.nestedMatches.length > 0) {
          const nestedResult = this.evaluateMatches(
            match.nestedMatches,
            targetPath,
            mergedContext,
            fullPattern
          );
          if (nestedResult.allowed) {
            return nestedResult;
          }
        }
      } else if (match.nestedMatches.length > 0) {
        // Check if pattern is a prefix of targetPath to continue recursion
        const prefixMatches = this.matchPrefix(fullPattern, targetPath, capturedParams);
        if (prefixMatches) {
          const mergedContext: EvaluationContext = {
            ...context,
            params: { ...context.params, ...capturedParams },
          };
          const nestedResult = this.evaluateMatches(
            match.nestedMatches,
            targetPath,
            mergedContext,
            fullPattern
          );
          if (nestedResult.allowed) {
            return nestedResult;
          }
        }
      }
    }

    return { allowed: false };
  }

  private matchPattern(
    pattern: string,
    target: string,
    params: Record<string, string>
  ): boolean {
    const pSegs = pattern.split('/').filter(Boolean);
    const tSegs = target.split('/').filter(Boolean);

    // If recursive wildcard {document=**} is present at the end
    const lastSeg = pSegs[pSegs.length - 1];
    if (lastSeg && lastSeg.includes('=**}')) {
      const paramName = lastSeg.slice(1, lastSeg.indexOf('='));
      const prefixCount = pSegs.length - 1;
      if (tSegs.length < prefixCount) return false;
      for (let i = 0; i < prefixCount; i++) {
        if (!this.matchSegment(pSegs[i], tSegs[i], params)) return false;
      }
      params[paramName] = tSegs.slice(prefixCount).join('/');
      return true;
    }

    if (pSegs.length !== tSegs.length) return false;

    for (let i = 0; i < pSegs.length; i++) {
      if (!this.matchSegment(pSegs[i], tSegs[i], params)) return false;
    }

    return true;
  }

  private matchPrefix(
    pattern: string,
    target: string,
    params: Record<string, string>
  ): boolean {
    const pSegs = pattern.split('/').filter(Boolean);
    const tSegs = target.split('/').filter(Boolean);

    if (pSegs.length > tSegs.length) return false;

    for (let i = 0; i < pSegs.length; i++) {
      if (!this.matchSegment(pSegs[i], tSegs[i], params)) return false;
    }

    return true;
  }

  private matchSegment(
    pSeg: string,
    tSeg: string,
    params: Record<string, string>
  ): boolean {
    if (pSeg.startsWith('{') && pSeg.endsWith('}')) {
      const paramName = pSeg.slice(1, -1);
      params[paramName] = tSeg;
      return true;
    }
    return pSeg === tSeg;
  }

  private operationMatches(allowedOps: OperationType[], method: string): boolean {
    if (allowedOps.includes('read') && (method === 'get' || method === 'list')) return true;
    if (allowedOps.includes('write') && (method === 'create' || method === 'update' || method === 'delete')) return true;
    return allowedOps.includes(method as OperationType);
  }

  private evaluateExpression(expr: ExpressionNode, ctx: EvaluationContext): boolean {
    const val = this.resolveValue(expr, ctx);
    return Boolean(val);
  }

  private resolveValue(expr: ExpressionNode, ctx: EvaluationContext): unknown {
    switch (expr.type) {
      case 'Literal':
        return expr.value;

      case 'Identifier':
        if (expr.name === 'request') return ctx.request;
        if (expr.name === 'resource') return ctx.resource;
        if (expr.name in ctx.params) return ctx.params[expr.name];
        return undefined;

      case 'MemberAccess': {
        const obj = this.resolveValue(expr.object, ctx) as Record<string, unknown> | undefined;
        if (obj === null || obj === undefined || typeof obj !== 'object') {
          return undefined;
        }
        return obj[expr.property];
      }

      case 'UnaryExpression': {
        if (expr.operator === '!') {
          return !this.resolveValue(expr.argument, ctx);
        }
        return undefined;
      }

      case 'BinaryExpression': {
        const left = this.resolveValue(expr.left, ctx);
        const right = this.resolveValue(expr.right, ctx);

        switch (expr.operator) {
          case '&&':
            return Boolean(left) && Boolean(right);
          case '||':
            return Boolean(left) || Boolean(right);
          case '==':
            return left === right;
          case '!=':
            return left !== right;
          case '<':
            return (left as number) < (right as number);
          case '<=':
            return (left as number) <= (right as number);
          case '>':
            return (left as number) > (right as number);
          case '>=':
            return (left as number) >= (right as number);
        }
      }
    }
  }
}
