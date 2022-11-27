import { CommonToken } from 'antlr4ts';
import { ParseTree, TerminalNode } from "antlr4ts/tree";
import { ThriftData, ThriftParser } from "thrift-parser-ts";
import * as ThriftParserNS from "thrift-parser-ts/lib/ThriftParser";

type IsKindFunc = (node: ParseTree) => boolean;
type TightFN = (index: number, node: ParseTree) => boolean;
type NodeProcessFunc = (this: PureThriftFormatter, node: ParseTree) => void;
type FieldContext = ThriftParserNS.FieldContext|ThriftParserNS.Enum_fieldContext
export interface Option {
  indent: number,
  patch: boolean,
  comment: boolean,
  assignAlign: boolean,
}

export const newOption = (opt?: Partial<Option>):Option => {
  const defaultOption: Option = {
    indent: 4,
    patch: true,
    comment: true,
    assignAlign: false,
  }
  return {
    ...defaultOption,
    ...opt,
  }
}

export const isToken = (node: ParseTree, text: string): boolean => {
    return node instanceof TerminalNode && node.symbol.text === text;
}

export const isEOF = (node: ParseTree): boolean => {
  return node instanceof TerminalNode && node.symbol.type === ThriftParser.EOF;
}

export const isNeedNewLineNode = (node: ParseTree): boolean => {
  return (
    node instanceof ThriftParserNS.Enum_ruleContext ||
    node instanceof ThriftParserNS.Struct_Context ||
    node instanceof ThriftParserNS.Union_Context ||
    node instanceof ThriftParserNS.Exception_Context ||
    node instanceof ThriftParserNS.ServiceContext
  );
}

const splitFieldChildrenByAssign = (node: FieldContext):[ParseTree[], ParseTree[]] => {
  let i =0;
  for (;i < node.childCount; i++) {
    const child = node.getChild(i);
    if (isToken(child, "=") || (child instanceof ThriftParserNS.List_separatorContext)){
      break
    }
  }

  const left = node.children!.slice(0, i);
  const right = node.children!.slice(i);
  return [left, right];
}

export const splitFieldByAssign = (node: FieldContext):[ParseTree, ParseTree] => {
  /*
    split field's children to [left, right]
    field: '1: required i32 number_a = 0,'
    left:  '1: required i32 number_a'
    right: '= 0,'
  */
  let left :FieldContext|undefined = undefined;
  let right :FieldContext|undefined = undefined;

  if (node instanceof ThriftParserNS.FieldContext) {
    left = new ThriftParserNS.FieldContext(node.parent, 0);
    right = new ThriftParserNS.FieldContext(node.parent, 0);
  } else {
    left = new ThriftParserNS.Enum_fieldContext(node.parent, 0);
    right = new ThriftParserNS.Enum_fieldContext(node.parent, 0);
  }
  const [leftChildren, rightChildren] = splitFieldChildrenByAssign(node);
  for (const child of leftChildren) {
    left.addAnyChild(child)
  }
  for (const child of rightChildren) {
    right.addAnyChild(child)
  }

  return [left, right];
}

export const getNodeChildren = (node: ParseTree): ParseTree[] => {
  const children = [];
  for (let i = 0; i < node.childCount; i++) {
    children.push(node.getChild(i));
  }
  return children;
}

export const walkNode = (root: ParseTree, callback: (node: ParseTree) => void) => {
  const stack: ParseTree[] = [root];
  while (stack.length > 0) {
    const node = stack.shift()!;
    callback(node);
    const children = getNodeChildren(node);
    children.forEach(value => stack.push(value))
  }
}

export const splitRepeatNodes = (nodes: ParseTree[], kind_fn: IsKindFunc): [ParseTree[], ParseTree[]] => {
  const children = [];
  for (const [index, node] of nodes.entries()) {
    if (!kind_fn(node)) {
      return [children, nodes.slice(index)];
    }
    children.push(node);
  }
  return [children, []];
}

const genInlineContext = (join = " ", tight_fn?: TightFN | undefined): NodeProcessFunc => {
  return function (this: PureThriftFormatter, node: ParseTree) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.getChild(i);
      if (i > 0 && join.length > 0) {
        if (!tight_fn || !tight_fn(i, child)) {
          this._push(join);
        }
      }
      this.process_node(child);
    }
  };
}

const genSubblocksContext = (start: number, kind_fn: IsKindFunc): NodeProcessFunc => {
  return function (this: PureThriftFormatter, node: ParseTree) {
    const children = getNodeChildren(node);
    this._inline_nodes(children.slice(0, start));
    this._newline();

    const leftChildren = children.slice(start);
    const [subblocks, left] = splitRepeatNodes(leftChildren, kind_fn);

    this.before_subblocks_hook(subblocks);
    this._block_nodes(subblocks, " ".repeat(this._option.indent));
    this.after_subblocks_hook(subblocks);
    this._newline();

    this._inline_nodes(left);
  };
}

export class PureThriftFormatter {
  _option: Option = newOption();

  _newline_c = 0;
  _indent_s = "";
  private _out = "";

  format_node(node: ParseTree): string {
    this._out = "";
    this._newline_c = 0;
    this._indent_s = "";

    this.process_node(node);
    return this._out;
  }

  option(opt: Option) {
    this._option = opt;
  }

  get out(): string {
    return this._out;
  }

  _push(text: string) {
    if (this._newline_c > 0) {
      this._out += "\n".repeat(this._newline_c);
      this._newline_c = 0;
    }
    this._out += text;
  }

  _append(text: string) {
    this._out += text;
  }

  _newline(repeat = 1) {
    const diff = repeat - this._newline_c;
    if (diff <= 0) {
      return;
    }
    this._newline_c += diff;
  }

  _indent(indent = "") {
    this._indent_s = indent;
  }

  after_block_node_hook(_: ParseTree) {}  // eslint-disable-line
  before_block_node_hook(_: ParseTree) {} // eslint-disable-line

  _block_nodes(nodes: ParseTree[], indent = "") {
    let last_node: ParseTree | undefined = undefined;
    // eslint-disable-next-line
    for (let [index, node] of nodes.entries()) {
      if (
        node instanceof ThriftParserNS.HeaderContext ||
        node instanceof ThriftParserNS.DefinitionContext
      ) {
        node = node.getChild(0);
      }
      if (index > 0) {
        if (
          last_node!.constructor.name !== node.constructor.name ||
          isNeedNewLineNode(node)
        ) {
          this._newline(2);
        } else {
          this._newline();
        }
      }

      this._indent(indent);
      this.process_node(node);
      this.after_block_node_hook(node);
      last_node = node;
    }
  }

  _inline_nodes(nodes: ParseTree[], join = " ") {
    // eslint-disable-next-line
    for (let [index, node] of nodes.entries()) {
      if (index > 0) {
        this._push(join);
      }
      this.process_node(node);
    }
  }

  before_subblocks_hook(_: ParseTree[]) {} // eslint-disable-line
  after_subblocks_hook(_: ParseTree[]) {}  // eslint-disable-line

  process_node(node: ParseTree): void {
    if (node instanceof TerminalNode) {
      this.TerminalNode(node);
    } else if (node instanceof ThriftParserNS.DocumentContext) {
      this.DocumentContext(node);
    } else if (node instanceof ThriftParserNS.HeaderContext) {
      this.HeaderContext(node);
    } else if (node instanceof ThriftParserNS.DefinitionContext) {
      this.DefinitionContext(node);
    } else if (node instanceof ThriftParserNS.Include_Context) {
      this.Include_Context(node);
    } else if (node instanceof ThriftParserNS.Namespace_Context) {
      this.Namespace_Context(node);
    } else if (node instanceof ThriftParserNS.Typedef_Context) {
      this.Typedef_Context(node);
    } else if (node instanceof ThriftParserNS.Base_typeContext) {
      this.Base_typeContext(node);
    } else if (node instanceof ThriftParserNS.Real_base_typeContext) {
      this.Real_base_typeContext(node);
    } else if (node instanceof ThriftParserNS.Const_ruleContext) {
      this.Const_ruleContext(node);
    } else if (node instanceof ThriftParserNS.Const_valueContext) {
      this.Const_valueContext(node);
    } else if (node instanceof ThriftParserNS.IntegerContext) {
      this.IntegerContext(node);
    } else if (node instanceof ThriftParserNS.Container_typeContext) {
      this.Container_typeContext(node);
    } else if (node instanceof ThriftParserNS.Set_typeContext) {
      this.Set_typeContext(node);
    } else if (node instanceof ThriftParserNS.List_typeContext) {
      this.List_typeContext(node);
    } else if (node instanceof ThriftParserNS.Cpp_typeContext) {
      this.Cpp_typeContext(node);
    } else if (node instanceof ThriftParserNS.Const_mapContext) {
      this.Const_mapContext(node);
    } else if (node instanceof ThriftParserNS.Const_map_entryContext) {
      this.Const_map_entryContext(node);
    } else if (node instanceof ThriftParserNS.List_separatorContext) {
      this.List_separatorContext(node);
    } else if (node instanceof ThriftParserNS.Field_idContext) {
      this.Field_idContext(node);
    } else if (node instanceof ThriftParserNS.Field_reqContext) {
      this.Field_reqContext(node);
    } else if (node instanceof ThriftParserNS.Field_typeContext) {
      this.Field_typeContext(node);
    } else if (node instanceof ThriftParserNS.Map_typeContext) {
      this.Map_typeContext(node);
    } else if (node instanceof ThriftParserNS.Const_listContext) {
      this.Const_listContext(node);
    } else if (node instanceof ThriftParserNS.Enum_ruleContext) {
      this.Enum_ruleContext(node);
    } else if (node instanceof ThriftParserNS.Struct_Context) {
      this.Struct_Context(node);
    } else if (node instanceof ThriftParserNS.Union_Context) {
      this.Union_Context(node);
    } else if (node instanceof ThriftParserNS.Exception_Context) {
      this.Exception_Context(node);
    } else if (node instanceof ThriftParserNS.Enum_fieldContext) {
      this.Enum_fieldContext(node);
    } else if (node instanceof ThriftParserNS.FieldContext) {
      this.FieldContext(node);
    } else if (node instanceof ThriftParserNS.Function_Context) {
      this.Function_Context(node);
    } else if (node instanceof ThriftParserNS.OnewayContext) {
      this.OnewayContext(node);
    } else if (node instanceof ThriftParserNS.Function_typeContext) {
      this.Function_typeContext(node);
    } else if (node instanceof ThriftParserNS.Throws_listContext) {
      this.Throws_listContext(node);
    } else if (node instanceof ThriftParserNS.Type_annotationsContext) {
      this.Type_annotationsContext(node);
    } else if (node instanceof ThriftParserNS.Type_annotationContext) {
      this.Type_annotationContext(node);
    } else if (node instanceof ThriftParserNS.Annotation_valueContext) {
      this.Annotation_valueContext(node);
    } else if (node instanceof ThriftParserNS.ServiceContext) {
      this.ServiceContext(node);
    } else if (node instanceof ThriftParserNS.SenumContext) {
      this.SenumContext(node);
    } else {
      const msg = `Unknown node: ${node}`;
      // console.log(msg);
      throw msg;
    }
  }

  TerminalNode(node: TerminalNode) {
    if (isEOF(node)) {
      return;
    }

    if (this._indent_s.length > 0) {
      this._push(this._indent_s);
      this._indent_s = "";
    }

    this._push(node.symbol.text!);
  }

  DocumentContext: NodeProcessFunc = function (
    this: PureThriftFormatter,
    node: ParseTree
  ) {
    const children = getNodeChildren(node);
    this._block_nodes(children);
  };

  HeaderContext: NodeProcessFunc = function (
    this: PureThriftFormatter,
    node: ParseTree
  ) {
    this.process_node(node.getChild(0));
  };

  DefinitionContext: NodeProcessFunc = function (
    this: PureThriftFormatter,
    node: ParseTree
  ) {
    this.process_node(node.getChild(0));
  };

  // TODO: clean this?
  Include_Context: NodeProcessFunc = genInlineContext();
  Namespace_Context: NodeProcessFunc = genInlineContext();
  Typedef_Context: NodeProcessFunc = genInlineContext();
  Base_typeContext: NodeProcessFunc = genInlineContext();
  Field_typeContext: NodeProcessFunc = genInlineContext();
  Real_base_typeContext: NodeProcessFunc = genInlineContext();
  Const_ruleContext: NodeProcessFunc = genInlineContext();
  Const_valueContext: NodeProcessFunc = genInlineContext();
  IntegerContext: NodeProcessFunc = genInlineContext();
  Container_typeContext: NodeProcessFunc = genInlineContext("");
  Set_typeContext: NodeProcessFunc = genInlineContext("");
  List_typeContext: NodeProcessFunc = genInlineContext("");
  Cpp_typeContext: NodeProcessFunc = genInlineContext();
  Const_mapContext: NodeProcessFunc = genInlineContext();
  Const_map_entryContext: NodeProcessFunc = genInlineContext();
  List_separatorContext: NodeProcessFunc = genInlineContext();
  Field_idContext: NodeProcessFunc = genInlineContext("");
  Field_reqContext: NodeProcessFunc = genInlineContext();
  Map_typeContext: NodeProcessFunc = genInlineContext(
    " ",
    (i, n) => !isToken(n.parent!.getChild(i - 1), ",")
  );
  Const_listContext: NodeProcessFunc = genInlineContext(
    " ",
    (_, n) => n instanceof ThriftParserNS.List_separatorContext
  );
  Enum_ruleContext: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.Enum_fieldContext
  );
  Enum_fieldContext: NodeProcessFunc = genInlineContext(
    " ",
    (_, node) => node instanceof ThriftParserNS.List_separatorContext
  );
  Struct_Context: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  Union_Context: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  Exception_Context: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  FieldContext: NodeProcessFunc = genInlineContext(
    " ",
    (_, n) => n instanceof ThriftParserNS.List_separatorContext
  );
  Function_Context: NodeProcessFunc = genInlineContext(
    " ",
    (i, n) =>
      isToken(n, "(") ||
      isToken(n, ")") ||
      isToken(n.parent!.getChild(i - 1), "(") ||
      n instanceof ThriftParserNS.List_separatorContext
  );
  OnewayContext: NodeProcessFunc = genInlineContext();
  Function_typeContext: NodeProcessFunc = genInlineContext();
  Throws_listContext: NodeProcessFunc = genInlineContext(
    " ",
    (i, n) =>
    isToken(n, "(") ||
    isToken(n, ")") ||
    isToken(n.parent!.getChild(i - 1), "(") ||
      n instanceof ThriftParserNS.List_separatorContext
  );
  Type_annotationsContext: NodeProcessFunc = genInlineContext();
  Type_annotationContext: NodeProcessFunc = genInlineContext(
      " ",
      (i, n) => n instanceof ThriftParserNS.List_separatorContext
    );
  Annotation_valueContext: NodeProcessFunc = genInlineContext();
  ServiceContext_Default: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.Function_Context
  );
  ServiceContext_Extends: NodeProcessFunc = genSubblocksContext(
    5,
    (n) => n instanceof ThriftParserNS.Function_Context
  );

  ServiceContext: NodeProcessFunc = function (this: PureThriftFormatter, n: ParseTree) {
    const node = <ThriftParserNS.ServiceContext>n;
    if (isToken(node.getChild(2), "extends")) {
      this.ServiceContext_Extends(node);
    } else {
      this.ServiceContext_Default(node);
    }
  };

  SenumContext: NodeProcessFunc = function (this: PureThriftFormatter, _: ParseTree
  ) {}; // eslint-disable-line
}

export class ThriftFormatter extends PureThriftFormatter {
  private _data: ThriftData;
  private _document: ThriftParserNS.DocumentContext;

  private _field_comment_padding = 0;
  private _field_assign_padding = 0;
  private _last_token_index = -1;

  constructor(data: ThriftData) {
    super();
    this._data = data;
    this._document = data.document;
  }

  format(): string {
    if (this._option.patch) {
      this.patch();
    }
    return this.format_node(this._document);
  }

  patch() {
    walkNode(this._document, this._patch_field_req);
    walkNode(this._document, this._patch_field_list_separator);
    walkNode(this._document, this._patch_remove_last_list_separator);
  }

  _patch_field_req(n: ParseTree) {
    if (!(n instanceof ThriftParserNS.FieldContext)) {
      return;
    }
    if (n.parent === undefined
      || n.parent instanceof ThriftParserNS.Function_Context
      || n.parent instanceof ThriftParserNS.Function_Context) {
      return;
    }
    let i = 0;
    for (; i < n.childCount; i++) {
      const child = n.getChild(i);
      if (child instanceof ThriftParserNS.Field_reqContext) {
        return;
      }
      if (child instanceof ThriftParserNS.Field_typeContext) {
        break;
      }
    }

    const fake_token = new CommonToken(ThriftParser.T__20, "required");
    fake_token.line = -1;
    fake_token.charPositionInLine = -1;
    fake_token.tokenIndex = -1;
    const fake_node = new TerminalNode(fake_token);
    const fake_ctx = new ThriftParserNS.Field_reqContext(n, 0);

    fake_node.setParent(fake_ctx);
    fake_ctx.addChild(fake_node);

    fake_ctx.setParent(n);
    n.children!.splice(i, 0, fake_ctx);
  }

  _patch_field_list_separator(n: ParseTree) {
    if (!(n instanceof ThriftParserNS.Enum_fieldContext
      || n instanceof ThriftParserNS.FieldContext
      || n instanceof ThriftParserNS.Function_Context)) {
      return;
    }
    const child = n.getChild(n.childCount - 1);
    if (child instanceof ThriftParserNS.List_separatorContext) {
      const comma = <TerminalNode>child.getChild(0);
      const token = <CommonToken> comma.symbol;
      token.text = ",";
      return;
    }

    const fake_token = new CommonToken(ThriftParser.COMMA, ",");
    fake_token.line = -1;
    fake_token.charPositionInLine = -1;
    fake_token.tokenIndex = -1;
    const fake_node = new TerminalNode(fake_token);
    const fake_ctx = new ThriftParserNS.List_separatorContext(n, 0);

    fake_node.setParent(fake_ctx);
    fake_ctx.addChild(fake_node);

    fake_ctx.setParent(n);
    n.addChild(fake_ctx);
  }

  _patch_remove_last_list_separator(n: ParseTree) {
    const is_inline_field = n instanceof ThriftParserNS.FieldContext
      && (n.parent instanceof ThriftParserNS.Function_Context
        || n.parent instanceof ThriftParserNS.Throws_listContext);
    const is_inline_node = n instanceof ThriftParserNS.Type_annotationContext;

    if (!(is_inline_field || is_inline_node)) {
      return;
    }
    if (n.parent === undefined) {
      return;
    }

    let is_last = false;
    const brothers = n.parent.children || [];
    const bortherCount = n.parent.childCount;
    for (let i = 0; i < bortherCount; i++) {
      if (brothers[i] === n) {
        if (i === bortherCount - 1
          || n.constructor.name !== brothers[i + 1].constructor.name) {
          is_last = true;
          break;
        }
      }
    }

    if (is_last) {
      const child = n.getChild(n.childCount - 1);
      if (child instanceof ThriftParserNS.List_separatorContext) {
        n.removeLastChild();
      }
    }
  }

  private isFieldOREnumField(node: ParseTree) {
    return (
      node instanceof ThriftParserNS.FieldContext ||
      node instanceof ThriftParserNS.Enum_fieldContext)
  }

  public calc_subblocks_padding(fields: ParseTree[]):[number, number] {
    if (fields.length === 0) {
      return  [0, 0];
    }

    if (this._option.assignAlign && this.isFieldOREnumField(fields[0])) {
      let leftMaxSize = 0;
      let rightMaxSize = 0;

      for (const field of fields) {
        const node = <ThriftParserNS.FieldContext | ThriftParserNS.Enum_fieldContext> field;
        const [left, right] = splitFieldByAssign(node);
        const leftValue = new PureThriftFormatter().format_node(left);
        const rightValue = new PureThriftFormatter().format_node(right);
        leftMaxSize = leftMaxSize> leftValue.length?leftMaxSize: leftValue.length;
        rightMaxSize = rightMaxSize> rightValue.length?rightMaxSize: rightValue.length;
      }

      // add extra space "xxx = yyy" -> "xxx" + " " + "= yyy"
      const assignPadding = leftMaxSize + 1;
      const commentPadding = leftMaxSize + 1 + rightMaxSize;
      return [assignPadding, commentPadding];
    } else {
      let commentPadding = 0;
      for (const field of fields) {
        const fieldFmtValue = new PureThriftFormatter().format_node(field);
        commentPadding = commentPadding > fieldFmtValue.length? commentPadding: fieldFmtValue.length;
      }
      return [0, commentPadding];
    }
  }

  before_subblocks_hook(subblocks: ParseTree[]) {
    const [assignPadding, commentPadding] = this.calc_subblocks_padding(subblocks)
    if (assignPadding > 0) {
      this._field_assign_padding = assignPadding + this._option.indent;
    }

    if (commentPadding > 0) {
      this._field_comment_padding = commentPadding  + this._option.indent;
    }
  }

  after_subblocks_hook(_ :ParseTree[]) {
    this._field_comment_padding = 0;
    this._field_assign_padding = 0;
  }
  after_block_node_hook(_ :ParseTree) {
    this._tail_comment();
  }

  _line_comments(node: TerminalNode) {
    if (!this._option.comment) {
      return;
    }

    // fake_token
    if (node.symbol.line === -1) {
      return;
    }

    const tokenIndex = node.symbol.tokenIndex;
    const comments = [];
    const tokens = this._data.tokens.getTokens();
    for (const token of tokens.slice(this._last_token_index + 1)) {
      if (token.channel != 2) {
        continue;
      }
      if (token.tokenIndex < tokenIndex) {
        comments.push(token);
      }
    }

    for (const token of comments) {
      if (token.tokenIndex > 0 && token.type == ThriftParser.ML_COMMENT) {
        this._newline(2);
      }
      if (token.text === undefined) {
        return;
      }
      const text = token.text!;
      if (this._indent_s.length > 0) {
        this._push(this._indent_s);
      }
      this._push(text.trim());

      const last_line = token.line + text.split("\n").length - 1;
      const is_tight =
        token.type == ThriftParser.SL_COMMENT ||
        isEOF(node) ||
        (0 < node.symbol.line - last_line && node.symbol.line - last_line <= 1);
      if (is_tight) {
        this._newline();
      } else {
        this._newline(2);
      }
    }

    this._last_token_index = tokenIndex;
  }

  _current_line() {
    const parts = this.out.split('\n');
    const cur = parts[parts.length -1];
    return cur;
  }

  _padding(padding: number, pad: string = " ") {
    if (padding > 0) {
      padding = padding - this._current_line().length;
      if (padding > 0) {
        this._append(pad.repeat(padding));
      }
    }
  }

  _tail_comment() {
    if (!this._option.comment) {
      return;
    }
    if (this._last_token_index === -1) {
      return;
    }
    const tokens = this._data.tokens.getTokens();
    const last_token = tokens[this._last_token_index];
    const comments = [];
    for (const token of tokens.slice(this._last_token_index + 1)) {
      if (token.line != last_token.line) {
        break;
      }
      if (token.channel != 2) {
        continue;
      }
      comments.push(token);
    }

    if (comments.length > 0) {
      const comment = comments[0];
      // align comment
      this._padding(this._field_comment_padding, " ");
      this._append(" ");
      this._append(comment.text!.trim());
      this._push("");
      this._last_token_index = comment.tokenIndex;
    }
  }

  TerminalNode(n: ParseTree) {
    const node = <TerminalNode>n;

    if (this._newline_c > 0) {
      this._tail_comment();
    }

    this._line_comments(node);

    // padding before field's assgin node.
    // 1: required string username = "hello";
    // 2: required i64 age         = 1;
    if (this._option.assignAlign && this.isFieldOREnumField(node.parent!) && isToken(node, "=")) {
      this._padding(this._field_assign_padding, " ");
    }

    super.TerminalNode(node);
  }
}
