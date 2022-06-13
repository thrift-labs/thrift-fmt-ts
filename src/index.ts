import { ParseTree, TerminalNode } from "antlr4ts/tree";
import { ThriftData, ThriftParser } from "thrift-parser-ts";
import * as ThriftParserNS from "thrift-parser-ts/lib/ThriftParser";

type Nodes = ParseTree[];
type IsKindFunc = (node: ParseTree) => boolean;
type TightFN = (index: number, node: ParseTree) => boolean;
type NodeProcessFunc = (this: PureThriftFormatter, node: ParseTree) => void;
type NodeProcessorFunc = (node: ParseTree) => void;

export class PureThriftFormatter {
  static DEFAULT_INDENT = 4;

  _processor_map: Map<string, NodeProcessorFunc>;
  _option_indent: number = PureThriftFormatter.DEFAULT_INDENT;
  _newline_c = 0;
  _indent_s = "";
  _out = "";

  constructor() {
    this._processor_map = new Map<string, NodeProcessorFunc>();
    this._processor_map.set("DocumentContext", this.DocumentContext);
    this._processor_map.set("HeaderContext", this.HeaderContext);
    this._processor_map.set("DefinitionContext", this.DefinitionContext);
    ["Type_ruleContext",
    "Field_ruleContext",
    "Type_idContext",
    "Type_listContext",
    ].forEach(name => {
      this._processor_map.set(name, this._gen_inline_Context_v2(""));
    })
  }

  format_node(node: ParseTree): string {
    this._out = "";
    this._newline_c = 0;
    this._indent_s = "";

    this.process_node(node);
    return this._out;
  }

  static getChildren(node: ParseTree): Nodes {
    const children = [];
    for (let i = 0; i < node.childCount; i++) {
      children.push(node.getChild(i));
    }
    return children;
  }

  set_indent(indent: number): void {
    if (indent > 0) {
      this._option_indent = indent;
    }
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

  static walk_node(root: ParseTree, callback: (node: ParseTree) => void) {
    const stack: ParseTree[] = [root];
    while (stack.length > 0) {
      const node = stack.shift()!;
      callback(node);
      for (let i = 0; i < node.childCount; i++) {
        const child = node.getChild(i);
        stack.push(child);
      }
    }
  }

  static _get_repeat_children(
    nodes: ParseTree[],
    kind_fn: IsKindFunc
  ): [ParseTree[], ParseTree[]] {
    const children = [];
    for (const [index, node] of nodes.entries()) {
      if (!kind_fn(node)) {
        return [children, nodes.slice(index)];
      }
      children.push(node);
    }
    return [children, []];
  }

  static _is_EOF(node: ParseTree): boolean {
    return (
      node instanceof TerminalNode && node.symbol.type === ThriftParser.EOF
    );
  }

  static _is_token(node: ParseTree, text: string): boolean {
    return node instanceof TerminalNode && node.symbol.text === text;
  }

  static _is_newline_node(node: ParseTree): boolean {
    return (
      node instanceof ThriftParserNS.Enum_ruleContext ||
      node instanceof ThriftParserNS.Struct_Context ||
      node instanceof ThriftParserNS.Union_Context ||
      node instanceof ThriftParserNS.Exception_Context ||
      node instanceof ThriftParserNS.ServiceContext
    );
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
          typeof last_node !== typeof node ||
          PureThriftFormatter._is_newline_node(node)
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

  static _gen_inline_Context(join = " ", tight_fn?: TightFN | undefined): NodeProcessFunc {
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

  _gen_inline_Context_v2(join = " ", tight_fn?: TightFN | undefined): NodeProcessorFunc {
    const cur = this;
    return function (node: ParseTree) {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.getChild(i);
        if (i > 0 && join.length > 0) {
          if (!tight_fn || !tight_fn(i, child)) {
            cur._push(join);
          }
        }
        cur.process_node(child);
      }
    };
  }

  before_subfields_hook(_: ParseTree[]) {} // eslint-disable-line
  after_subfields_hook(_: ParseTree[]) {}  // eslint-disable-line

  static _gen_subfields_Context(
    start: number,
    kind_fn: IsKindFunc
  ): NodeProcessFunc {
    return function (this: PureThriftFormatter, node: ParseTree) {
      const children = PureThriftFormatter.getChildren(node);
      this._inline_nodes(children.slice(0, start));
      this._newline();

      const [fields, left] = PureThriftFormatter._get_repeat_children(
        children.slice(start),
        kind_fn
      );

      this.before_subfields_hook(fields);
      this._block_nodes(fields, " ".repeat(this._option_indent));
      this.after_subfields_hook(fields);
      this._newline();

      this._inline_nodes(left);
    };
  }

  process_node(node: ParseTree): void {
    const key = node.constructor.name;
    if (this._processor_map.has(key)) {
      this._processor_map.get(key)!(node);
    }

    switch (key) {
      case "TerminalNode":
        this.TerminalNode(node);
        break;
      case "DefinitionContext":
        this.DefinitionContext(node);
        break;
      case "Enum_fieldContext":
        this.Enum_fieldContext(node);
        break;
      case "Type_mapContext":
        this.Type_mapContext(node);
        break;
      case "Type_setContext":
        this.Type_setContext(node);
        break;
      case "Type_baseContext":
        this.Type_baseContext(node);
        break;
      case "Type_identifierContext":
        this.Type_identifierContext(node);
        break;
      case "Include_Context":
        this.Include_Context(node);
        break;
      case "Namespace_Context":
        this.Namespace_Context(node);
        break;
      case "Typedef_Context":
        this.Typedef_Context(node);
        break;
      case "Base_typeContext":
        this.Base_typeContext(node);
        break;
      case "Field_typeContext":
        this.Field_typeContext(node);
        break;
      case "Real_base_typeContext":
        this.Real_base_typeContext(node);
        break;
      case "Const_ruleContext":
        this.Const_ruleContext(node);
        break;
      case "Const_valueContext":
        this.Const_valueContext(node);
        break;
      case "IntegerContext":
        this.IntegerContext(node);
        break;
      case "Container_typeContext":
        this.Container_typeContext(node);
        break;
      case "Set_typeContext":
        this.Set_typeContext(node);
        break;
      case "List_typeContext":
        this.List_typeContext(node);
        break;
      case "Cpp_typeContext":
        this.Cpp_typeContext(node);
        break;
      case "Const_mapContext":
        this.Const_mapContext(node);
        break;
      case "Const_map_entryContext":
        this.Const_map_entryContext(node);
        break;
      case "List_separatorContext":
        this.List_separatorContext(node);
        break;
      case "Field_idContext":
        this.Field_idContext(node);
        break;
      case "Field_reqContext":
        this.Field_reqContext(node);
        break;
      case "Map_typeContext":
        this.Map_typeContext(node);
        break;
      case "Const_listContext":
        this.Const_listContext(node);
        break;
      case "Enum_ruleContext":
        this.Enum_ruleContext(node);
        break;
      case "Struct_Context":
        this.Struct_Context(node);
        break;
      case "Union_Context":
        this.Union_Context(node);
        break;
      case "Exception_Context":
        this.Exception_Context(node);
        break;
      case "FieldContext":
        this.FieldContext(node);
        break;
      case "Function_Context":
        this.Function_Context(node);
        break;
      case "OnewayContext":
        this.OnewayContext(node);
        break;
      case "Function_typeContext":
        this.Function_typeContext(node);
        break;
      case "Throws_listContext":
        this.Throws_listContext(node);
        break;
      case "Type_annotationsContext":
        this.Type_annotationsContext(node);
        break;
      case "Type_annotationContext":
        this.Type_annotationContext(node);
        break;
      case "Annotation_valueContext":
        this.Annotation_valueContext(node);
        break;
      case "ServiceContext":
        this.ServiceContext(node);
        break;
      case "SenumContext":
        this.SenumContext(node);
        break;
    }
  }

  TerminalNode(n: ParseTree) {
    const node = <TerminalNode>n;

    if (PureThriftFormatter._is_EOF(node)) {
      return;
    }

    if (this._indent_s.length > 0) {
      this._push(this._indent_s);
      this._indent_s = "";
    }

    this._push(node.symbol.text!);
  }

  DocumentContext(node: ParseTree) {
    const children = PureThriftFormatter.getChildren(node);
    this._block_nodes(children);
  }

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

  Type_mapContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Type_setContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Type_baseContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Type_identifierContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Include_Context: NodeProcessFunc = PureThriftFormatter._gen_inline_Context();
  Namespace_Context: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  Typedef_Context: NodeProcessFunc = PureThriftFormatter._gen_inline_Context();
  Base_typeContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context();
  Field_typeContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  Real_base_typeContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  Const_ruleContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  Const_valueContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  IntegerContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context();
  Container_typeContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Set_typeContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  List_typeContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Cpp_typeContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context();
  Const_mapContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context();
  Const_map_entryContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  List_separatorContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  Field_idContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Field_reqContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context(" ");

  Map_typeContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context(
    " ",
    (i, n) => !PureThriftFormatter._is_token(n.parent!.getChild(i - 1), ",")
  );

  Const_listContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context(
    " ",
    (_, n) => n instanceof ThriftParserNS.List_separatorContext
  );
  Enum_ruleContext: NodeProcessFunc =
    PureThriftFormatter._gen_subfields_Context(
      3,
      (n) => n instanceof ThriftParserNS.Enum_fieldContext
  );
  Enum_fieldContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context(
    " ",
    (_, node) => node instanceof ThriftParserNS.List_separatorContext
  );
  Struct_Context: NodeProcessFunc = PureThriftFormatter._gen_subfields_Context(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  Union_Context: NodeProcessFunc = PureThriftFormatter._gen_subfields_Context(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  Exception_Context: NodeProcessFunc =
    PureThriftFormatter._gen_subfields_Context(
      3,
      (n) => n instanceof ThriftParserNS.FieldContext
    );
  FieldContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context(
    " ",
    (_, n) => n instanceof ThriftParserNS.List_separatorContext
  );
  Function_Context: NodeProcessFunc = PureThriftFormatter._gen_inline_Context(
    " ",
    (i, n) =>
      PureThriftFormatter._is_token(n, "(") ||
      PureThriftFormatter._is_token(n, ")") ||
      PureThriftFormatter._is_token(n.parent!.getChild(i - 1), "(") ||
      n instanceof ThriftParserNS.List_separatorContext
  );
  OnewayContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context();
  Function_typeContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  Throws_listContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context(
    " ",
    (i, n) =>
      PureThriftFormatter._is_token(n, "(") ||
      PureThriftFormatter._is_token(n, ")") ||
      PureThriftFormatter._is_token(n.parent!.getChild(i - 1), "(") ||
      n instanceof ThriftParserNS.List_separatorContext
  );
  Type_annotationsContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();
  Type_annotationContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context(
      " ",
      (i, n) => n instanceof ThriftParserNS.List_separatorContext
    );
  Annotation_valueContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context();

  ServiceContext_Default: NodeProcessFunc =
    PureThriftFormatter._gen_subfields_Context(
      3,
      (n) => n instanceof ThriftParserNS.Function_Context
    );
  ServiceContext_Extends: NodeProcessFunc =
    PureThriftFormatter._gen_subfields_Context(
      5,
      (n) => n instanceof ThriftParserNS.Function_Context
    );

  ServiceContext: NodeProcessFunc = function (
    this: PureThriftFormatter,
    n: ParseTree
  ) {
    const node = <ThriftParserNS.ServiceContext>n;
    if (PureThriftFormatter._is_token(node.getChild(2), "extends")) {
      this.ServiceContext_Extends(node);
    } else {
      this.ServiceContext_Default(node);
    }
  };

  SenumContext: NodeProcessFunc = function (this: PureThriftFormatter, _: ParseTree
  ) {}; // eslint-disable-line
}

export class ThriftFormatter extends PureThriftFormatter {
  _data: ThriftData;
  _document: ThriftParserNS.DocumentContext;
  _option_comment = true;
  _option_patch = true;

  _field_padding = 0;
  _last_token_index = -1;

  constructor(data: ThriftData) {
    super();
    this._data = data;
    this._document = data.document;
  }

  option(comment: boolean, patch: boolean, indent?: number) {
    this._option_comment = comment;
    this._option_patch = patch;
    if (indent !== undefined) {
      this.set_indent(indent);
    }
  }

  format(): string {
    if (this._option_patch) {
      this.patch();
    }
    return this.format_node(this._document);
  }

  patch() {
    PureThriftFormatter.walk_node(this._document, this._patch_field_req);
    PureThriftFormatter.walk_node(
      this._document,
      this._patch_field_list_separator
    );
    PureThriftFormatter.walk_node(
      this._document,
      this._patch_remove_last_list_separator
    );
  }

  // TODO: implement
  _patch_field_req(n: ParseTree) {}             // eslint-disable-line
  _patch_field_list_separator(n: ParseTree) {}  // eslint-disable-line
  _patch_remove_last_list_separator(n: ParseTree) {} // eslint-disable-line

  _calc_subfields_padding(fields: ParseTree[]) {
    if (fields.length === 0) {
      return 0;
    }

    let padding = 0;
    for (const field of fields) {
      const field_out = new PureThriftFormatter().format_node(field);
      const field_padding = field_out.length;
      if (field_padding > padding) {
        padding = field_padding;
      }
    }
    return padding;
  }

  before_subfields_hook(fields: ParseTree[]) {
    this._field_padding =
      this._calc_subfields_padding(fields) + this._option_indent;
  }
  after_subfields_hook(fields: ParseTree[]) {
    this._field_padding = 0;
  }

  after_block_node_hook(_: ParseTree) {
    this._tail_comment();
  }

  _line_comments(node: TerminalNode) {
    if (!this._option_comment) {
      return;
    }
    //if hasattr(node.symbol, 'is_fake') and node.symbol.is_fake:
    //  return
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
        PureThriftFormatter._is_EOF(node) ||
        (0 < node.symbol.line - last_line && node.symbol.line - last_line <= 1);
      if (is_tight) {
        this._newline();
      } else {
        this._newline(2);
      }
    }

    this._last_token_index = tokenIndex;
  }

  _tail_comment() {
    if (!this._option_comment) {
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
      // align
      if (this._field_padding > 0) {
        const parts = this._out.split('\n');
        const cur_tail = parts[parts.length -1];
        const padding = this._field_padding - cur_tail.length;
        if (padding > 0) {
          this._append(" ".repeat(padding));
        }
      }
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
    super.TerminalNode(node);
  }
}
