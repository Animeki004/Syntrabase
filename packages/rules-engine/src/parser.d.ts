import { RulesRootNode } from './ast.js';
export declare class RulesParser {
    private source;
    private tokens;
    private pos;
    constructor(source: string);
    private tokenize;
    private peek;
    private consume;
    private check;
    parse(): RulesRootNode;
    private parseMatch;
    private parseAllow;
    private parseExpression;
    private parseOr;
    private parseAnd;
    private parseComparison;
    private parseUnary;
    private parsePrimary;
}
//# sourceMappingURL=parser.d.ts.map