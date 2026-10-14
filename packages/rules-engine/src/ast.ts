/**
 * AST Nodes for Declarative Security Rules
 */

export type OperationType = 'read' | 'get' | 'list' | 'write' | 'create' | 'update' | 'delete';

export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | MemberAccessNode
  | BinaryExpressionNode
  | UnaryExpressionNode;

export interface LiteralNode {
  type: 'Literal';
  value: string | number | boolean | null;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
}

export interface MemberAccessNode {
  type: 'MemberAccess';
  object: ExpressionNode;
  property: string;
}

export interface BinaryExpressionNode {
  type: 'BinaryExpression';
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||';
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryExpressionNode {
  type: 'UnaryExpression';
  operator: '!';
  argument: ExpressionNode;
}

export interface AllowStatementNode {
  type: 'AllowStatement';
  operations: OperationType[];
  condition: ExpressionNode;
}

export interface MatchStatementNode {
  type: 'MatchStatement';
  pathPattern: string;
  allowStatements: AllowStatementNode[];
  nestedMatches: MatchStatementNode[];
}

export interface RulesRootNode {
  type: 'RulesRoot';
  version: string;
  service: string;
  matches: MatchStatementNode[];
}
