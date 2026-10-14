import { EvaluationContext, EvaluationResult } from './evaluator.js';
import { RulesRootNode } from './ast.js';
export * from './ast.js';
export * from './parser.js';
export * from './evaluator.js';
export declare function compileRules(source: string): RulesRootNode;
export declare function evaluateRules(ast: RulesRootNode, path: string, context: EvaluationContext): EvaluationResult;
//# sourceMappingURL=index.d.ts.map