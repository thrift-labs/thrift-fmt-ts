import { ParseTree, TerminalNode } from "antlr4ts/tree";
import { ThriftData, ThriftParser } from "thirft-parser-ts";
import * as ThriftParserNS from "thirft-parser-ts/lib/ThriftParser";

export function hello(): ThriftData {
  return ThriftData.from_string('include "shared.thrift"');
}

type Nodes = ParseTree[];
type IsKindFunc = (node: ParseTree) => boolean;
type TightFN = (index: number, node: ParseTree) => boolean;
type NodeProcessFunc = (this: PureThriftFormatter, node: ParseTree) => void;

export function getChildren(node: ParseTree): Nodes {
  const children = [];
  for (let i = 0; i < node.childCount; i++) {
    children.push(node.getChild(i));
  }
  return children;
}

export class PureThriftFormatter {
  static DEFAULT_INDENT: number = 4;

  _option_indent: number = PureThriftFormatter.DEFAULT_INDENT;
  _newline_c: number = 0;
  _indent_s: string = "";
  _out: string = "";

  format_node(node: ParseTree): string {
    this._out = "";
    this._newline_c = 0;
    this._indent_s = "";

    this.process_node(node);
    return this._out;
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

  _newline(repeat: number = 1) {
    const diff = repeat - this._newline_c;
    if (diff <= 0) {
      return;
    }
    this._newline_c += diff;
  }

  _indent(indent: string = "") {
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

  after_block_node_hook(_: ParseTree) {}
  before_block_node_hook(_: ParseTree) {}

  _block_nodes(nodes: ParseTree[], indent: string = "") {
    let last_node: ParseTree | undefined = undefined;
    for (let [index, node] of nodes.entries()) {
      if (
        node instanceof ThriftParserNS.HeaderContext ||
        node instanceof ThriftParserNS.DefinitionContext
      ) {
        node = node.getChild(0);
      }
      if (index > 0) {
        if (
          typeof last_node === typeof node ||
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

  _inline_nodes(nodes: ParseTree[], join: string = " ") {
    for (let [index, node] of nodes.entries()) {
      if (index > 0) {
        this._push(join);
      }
      this.process_node(node);
    }
  }

  static _gen_inline_Context(
    join: string = " ",
    tight_fn?: TightFN | undefined
  ): NodeProcessFunc {
    return function (this: PureThriftFormatter, node: ParseTree) {
      for (let i = 0; i < node.childCount; i++) {
        if (i > 0 && join.length > 0) {
          if (!tight_fn || !tight_fn(i, node)) {
            this._push(join);
          }
        }
        this.process_node(node.getChild(i));
      }
    };
  }

  before_subfields_hook(_: ParseTree[]) {}
  after_subfields_hook(_: ParseTree[]) {}

  static _gen_subfields_Context(
    start: number,
    kind_fn: IsKindFunc
  ): NodeProcessFunc {
    return function (this: PureThriftFormatter, node: ParseTree) {
      const children = getChildren(node);
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
    switch (key) {
      case "TerminalNode":
        this.TerminalNode(node);
        break;
      case "DocumentContext":
        this.DocumentContext(node);
        break;
      case "HeaderContext":
        this.HeaderContext(node);
        break;
      case "DefinitionContext":
        this.DefinitionContext(node);
        break;
      case "Type_ruleContext":
        this.Type_ruleContext(node);
        break;
      case "Enum_fieldContext":
        this.Enum_fieldContext(node);
        break;
      case "Field_ruleContext":
        this.Field_ruleContext(node);
        break;
      case "Type_idContext":
        this.Type_idContext(node);
        break;
      case "Type_listContext":
        this.Type_listContext(node);
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
      case "Container_typeContext":
        this.Container_typeContext(node);
      case "Set_typeContext":
        this.Set_typeContext(node);
      case "List_typeContext":
        this.List_typeContext(node);
      case "Cpp_typeContext":
        this.Cpp_typeContext(node);
      case "Const_mapContext":
        this.Const_mapContext(node);
      case "Const_map_entryContext":
        this.Const_map_entryContext(node);
      case "List_separatorContext":
        this.List_separatorContext(node);
      case "Field_idContext":
        this.Field_idContext(node);
      case "Field_reqContext":
        this.Field_reqContext(node);
      case "Map_typeContext":
        this.Map_typeContext(node);
      case "Const_listContext":
        this.Const_listContext(node);
      case "Enum_ruleContext":
        this.Enum_ruleContext(node);
      case "Struct_Context":
        this.Struct_Context(node);
      case "Union_Context":
        this.Union_Context(node);
      case "ExceptionContext":
        this.ExceptionContext(node);
      case "FieldContext":
        this.FieldContext(node);
      case "Function_Context":
        this.Function_Context(node);
      case "OnewayContext":
        this.OnewayContext(node);
      case "Function_typeContext":
        this.Function_typeContext(node);
      case "Throws_listContext":
        this.Throws_listContext(node);
      case "Type_annotationsContext":
        this.Type_annotationsContext(node);
      case "Type_annotationContext":
        this.Type_annotationContext(node);
      case "Annotation_valueContext":
        this.Annotation_valueContext(node);
      case "ServiceContext":
        this.ServiceContext(node);
      case "SenumContext":
        this.SenumContext(node);
    }
  }

  TerminalNode: NodeProcessFunc = function (
    this: PureThriftFormatter,
    n: ParseTree
  ) {
    const node = <TerminalNode>n;

    if (PureThriftFormatter._is_EOF(node)) {
      return;
    }

    if (this._indent_s.length > 0) {
      this._push(this._indent_s);
      this._indent_s = "";
    }

    this._push(node.symbol.text!);
  };

  DocumentContext: NodeProcessFunc = function (
    this: PureThriftFormatter,
    node: ParseTree
  ) {
    const children = getChildren(node);
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

  Type_ruleContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Enum_fieldContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context(
    " ",
    (_, node) => node instanceof ThriftParserNS.Enum_fieldContext
  );
  Field_ruleContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
  Type_idContext: NodeProcessFunc = PureThriftFormatter._gen_inline_Context("");
  Type_listContext: NodeProcessFunc =
    PureThriftFormatter._gen_inline_Context("");
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
  Struct_Context: NodeProcessFunc = PureThriftFormatter._gen_subfields_Context(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  Union_Context: NodeProcessFunc = PureThriftFormatter._gen_subfields_Context(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  ExceptionContext: NodeProcessFunc =
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

  SenumContext: NodeProcessFunc = function (
    this: PureThriftFormatter,
    n: ParseTree
  ) {};
}

/*
class ThriftFormatter(PureThriftFormatter):
    def __init__(self, data: ThriftData):
        super().__init__()

        self._data: ThriftData = data
        self._document: ThriftParser.DocumentContext = data.document

        self._option_comment: bool = True
        self._option_patch: bool = True

        self._field_padding: int = 0
        self._last_token_index: int = -1

    def option(self, comment: Optional[bool] = None, patch: Optional[bool] = None, indent: Optional[int] = None):
        if comment is not None:
            self._option_comment = comment
        if patch is not None:
            self._option_patch = patch
        if indent is not None:
            self.set_indent(indent)

    def format(self) -> str:
        if self._option_patch:
            self.patch()

        return self.format_node(self._document)

    def patch(self):
        self._document.parent = None
        self.walk_node(self._document, self._patch_field_req)
        self.walk_node(self._document, self._patch_field_list_separator)
        self.walk_node(self._document, self._patch_remove_last_list_separator)

    @staticmethod
    def _patch_field_req(node: ParseTree):
        if not isinstance(node, ThriftParser.FieldContext):
            return
        if isinstance(node.parent, (ThriftParser.Function_Context, ThriftParser.Throws_listContext)):
            return

        for i, child in enumerate(node.children):
            if isinstance(child, ThriftParser.Field_reqContext):
                return
            if isinstance(child, ThriftParser.Field_typeContext):
                break

        fake_token = CommonToken()
        fake_token.type = 21
        fake_token.text = 'required'
        fake_token.is_fake = True
        fake_node = TerminalNodeImpl(fake_token)
        fake_req = ThriftParser.Field_reqContext(parser=node.parser)
        fake_req.children = [fake_node]
        # patch
        node.children.insert(i, fake_req)

    @staticmethod
    def _patch_field_list_separator(node: ParseTree):
        classes = (
            ThriftParser.Enum_fieldContext,
            ThriftParser.FieldContext,
            ThriftParser.Function_Context,
        )
        if not isinstance(node, classes):
            return

        tail = node.children[-1]
        if isinstance(tail, ThriftParser.List_separatorContext):
            tail.children[0].symbol.text = ','
            return

        fake_token = CommonToken()
        fake_token.text = ','
        fake_token.is_fake = True
        fake_node = TerminalNodeImpl(fake_token)
        fake_ctx = ThriftParser.List_separatorContext(parser=node.parser)
        fake_ctx.children = [fake_node]
        node.children.append(fake_ctx)

    def _patch_remove_last_list_separator(self, node: ParseTree):
        is_inline_field = isinstance(node, ThriftParser.FieldContext) and \
            isinstance(node.parent, (ThriftParser.Function_Context, ThriftParser.Throws_listContext))
        is_inline_node = isinstance(node, ThriftParser.Type_annotationContext)

        if is_inline_field or is_inline_node:
            self._remove_last_list_separator(node)

    @staticmethod
    def _remove_last_list_separator(node: ParseTree):
        if not node.parent:
            return

        is_last = False
        brothers = node.parent.children
        for i, child in enumerate(brothers):
            if child is node and i < len(brothers) - 1:
                if not isinstance(brothers[i + 1], child.__class__):
                    is_last = True
                    break

        if is_last and isinstance(node.children[-1], ThriftParser.List_separatorContext):
            node.children.pop()

    def _calc_subfields_padding(self, fields: List[ParseTree]):
        if not fields:
            return 0

        padding = 0
        for i, field in enumerate(fields):
            out = PureThriftFormatter().format_node(field)
            if len(out) > padding:
                padding = len(out)
        return padding

    def before_subfields_hook(self, fields: List[ParseTree]):
        self._field_padding = self._calc_subfields_padding(fields) + self._option_indent

    def after_subfields_hook(self, _: List[ParseTree]):
        self._field_padding = 0

    def after_block_node_hook(self, _: ParseTree):
        self._tail_comment()

    def _line_comments(self, node: TerminalNodeImpl):
        if not self._option_comment:
            return

        if hasattr(node.symbol, 'is_fake') and node.symbol.is_fake:
            return

        token_index = node.symbol.tokenIndex
        comments = []
        for token in self._data.tokens[self._last_token_index + 1:]:
            if token.channel != 2:
                continue
            if self._last_token_index < token.tokenIndex < token_index:
                comments.append(token)

        for i, token in enumerate(comments):
            if token.tokenIndex > 0 and token.type == ThriftParser.ML_COMMENT:
                self._newline(2)

            if self._indent_s:
                self._push(self._indent_s)
            self._push(token.text.strip())

            is_tight: bool = token.type == ThriftParser.SL_COMMENT \
                or self._is_EOF(node) \
                or 0 < node.symbol.line - (token.text.count('\n') + token.line) <= 1
            if is_tight:
                self._newline()
            else:
                self._newline(2)

        self._last_token_index = node.symbol.tokenIndex

    def _tail_comment(self):
        if not self._option_comment:
            return

        if self._last_token_index == -1:
            return

        last_token = self._data.tokens[self._last_token_index]
        comments = []
        for token in self._data.tokens[self._last_token_index + 1:]:
            if token.line != last_token.line:
                break
            if token.channel != 2:
                continue
            comments.append(token)

        assert len(comments) <= 1
        if comments:
            if self._field_padding > 0:
                cur = len(self._out.getvalue().rsplit('\n', 1)[-1])
                padding = self._field_padding - cur
                if padding > 0:
                    self._append(' ' * padding)

            self._append(' ')
            self._append(comments[0].text.strip())
            self._push('')
            self._last_token_index = comments[0].tokenIndex

    def TerminalNodeImpl(self, node: TerminalNodeImpl):
        assert isinstance(node, TerminalNodeImpl)

        # add tail comment before a new line
        if self._newline_c > 0:
            self._tail_comment()

        # add abrove comments
        self._line_comments(node)

        super().TerminalNodeImpl(node)
*/
