import { RulesRootNode } from './ast.js';
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
export declare class RulesEvaluator {
    private ast;
    constructor(ast: RulesRootNode);
    evaluate(path: string, context: EvaluationContext): EvaluationResult;
    private normalizePath;
    private evaluateMatches;
    private matchPattern;
    private matchPrefix;
    private matchSegment;
    private operationMatches;
    private evaluateExpression;
    private resolveValue;
}
//# sourceMappingURL=evaluator.d.ts.map