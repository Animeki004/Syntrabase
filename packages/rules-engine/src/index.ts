import { RulesParser } from './parser.js';
import { EvaluationContext, EvaluationResult, RulesEvaluator } from './evaluator.js';
import { RulesRootNode } from './ast.js';

export * from './ast.js';
export * from './parser.js';
export * from './evaluator.js';

export function compileRules(source: string): RulesRootNode {
  const parser = new RulesParser(source);
  return parser.parse();
}

export function evaluateRules(
  ast: RulesRootNode,
  path: string,
  context: EvaluationContext
): EvaluationResult {
  const evaluator = new RulesEvaluator(ast);
  return evaluator.evaluate(path, context);
}
