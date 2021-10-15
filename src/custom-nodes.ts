import { AST, builders as _builders } from '@glimmer/syntax';

export type QuoteType = '"' | "'";
export interface AnnotatedAttrNode extends AST.AttrNode {
  // like `<input disabled>` or `<div ...attributes>`
  isValueless?: boolean;
  // TextNode values can use single, double, or no quotes
  // `type=input` vs `type='input'` vs `type="input"`
  // ConcatStatement values can use single or double quotes
  // `class='thing {{get this classNames}}'` vs `class="thing {{get this classNames}}"`
  // MustacheStatements never use quotes
  quoteType?: QuoteType | null;
}

export interface AnnotatedStringLiteral extends AST.StringLiteral {
  quoteType?: QuoteType;
}

// The glimmer printer doesn't have any formatting suppport.
// It always uses double quotes, and won't print attrs without
// a value. To choose quote types or omit the value, we've
// gotta do it ourselves.
export function useCustomPrinter(node: AST.BaseNode): boolean {
  switch (node.type) {
    case 'StringLiteral':
      return !!(node as AnnotatedStringLiteral).quoteType;
      break;
    case 'AttrNode':
      {
        const n = node as AnnotatedAttrNode;
        return !!n.isValueless || n.quoteType !== undefined;
      }
      break;
    default:
      return false;
  }
}

type ReplaceReturnType<F extends (...a: any) => any, NewReturn> = (
  ...a: Parameters<F>
) => NewReturn;

// Update glimmer's builders to return our annotated types,
// so that tests and users can specify formatting properties
// on constructed nodes
type _Builders = typeof _builders;
export interface Builders extends Omit<_Builders, 'attr' | 'string'> {
  attr: ReplaceReturnType<typeof _builders.attr, AnnotatedAttrNode>;
  string: ReplaceReturnType<typeof _builders.string, AnnotatedStringLiteral>;
}

export const builders = _builders as Builders;
