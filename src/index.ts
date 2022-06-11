import { ParseTree, TerminalNode } from 'antlr4ts/tree';
import { ThriftData, ThriftParser } from 'thirft-parser-ts';
import * as ThriftParserNS from 'thirft-parser-ts/lib/ThriftParser';


export function hello(): ThriftData {
    return ThriftData.from_string('include "shared.thrift"');
}

type Nodes = ParseTree[];
type NodeIsKindFunc = (node: ParseTree) => boolean;
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
    static DEFAULT_INDENT: number = 4

    _option_indent: number = PureThriftFormatter.DEFAULT_INDENT;
    _newline_c: number = 0;
    _indent_s: string = '';
    _out: string = '';

    format_node(node: ParseTree): string {
        this._out = '';
        this._newline_c = 0;
        this._indent_s = '';

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
            this._out += '\n'.repeat(this._newline_c);
            this._newline_c = 0;
        }
        this._out += text;
    }

    _append(text: string) {
        this._out += text;
    }

    _newline(repeat:number = 1) {
        const diff = repeat - this._newline_c;
        if (diff <= 0) {
            return;
        }
        this._newline_c += diff;
    }

    _indent(indent: string = '') {
        this._indent_s = indent;
    }

    static walk_node(root: ParseTree, callback: (node: ParseTree) => void) {
        const stack: ParseTree[] = [root];
        while (stack.length > 0) {
            const node = stack.shift()!;
            callback(node);
            for (let i=0; i<node.childCount; i++) {
                const child = node.getChild(i);
                stack.push(child);
            }
        }
    }

    static _get_repeat_children(nodes: ParseTree[], kind_fn: NodeIsKindFunc): [ParseTree[], ParseTree[]] {
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
        return node instanceof TerminalNode && node.symbol.type === ThriftParser.EOF;
    }

    static _is_token(node: ParseTree, text: string): boolean {
        return node instanceof TerminalNode && node.symbol.text === text;
    }

    static _is_newline_node(node: ParseTree): boolean {
        return node instanceof ThriftParserNS.Enum_ruleContext
        || node instanceof ThriftParserNS.Struct_Context
        || node instanceof ThriftParserNS.Union_Context
        || node instanceof ThriftParserNS.Exception_Context
        || node instanceof ThriftParserNS.ServiceContext
    }

    after_block_node_hook(_: ParseTree) {}
    before_block_node_hook(_: ParseTree) {}

    _block_nodes(nodes: ParseTree[], indent: string = '') {
        let last_node :ParseTree|undefined = undefined;
        for (let [index, node] of nodes.entries()) {
            if (node instanceof ThriftParserNS.HeaderContext || node instanceof ThriftParserNS.DefinitionContext) {
                node = node.getChild(0);
            }
            if (index > 0) {
                if (typeof last_node === typeof node || PureThriftFormatter._is_newline_node(node)) {
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

    _inline_nodes(nodes: ParseTree[], join: string = ' ') {
        for (let [index, node] of nodes.entries()) {
            if (index > 0) {
                this._push(join);
            }
            this.process_node(node);
        }
    }

    static _gen_inline_Context(join: string = '', tight_fn: TightFN|undefined) :NodeProcessFunc {
        return function(this: PureThriftFormatter, node: ParseTree) {
            for (let i =0; i<node.childCount; i++) {
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

    static _gen_subfields_Context(start:number, kind_fn: NodeIsKindFunc) :NodeProcessFunc {
        return function(this: PureThriftFormatter, node: ParseTree) {
            const children = getChildren(node);
            this._inline_nodes(children.slice(0, start));
            this._newline();

            const [fields, left] = PureThriftFormatter._get_repeat_children(
                children.slice(start), kind_fn);

            this.before_subfields_hook(fields);
            this._block_nodes(fields, ' '.repeat(this._option_indent));
            this.after_subfields_hook(fields);
            this._newline();

            this._inline_nodes(left);
        }
    }

    process_node(node: ParseTree): void {
        const key = (typeof node) as keyof typeof this;
        switch (key) {
        case 'TerminalNode':
            this.TerminalNode(node);
        }
    }

    TerminalNode = function (this: PureThriftFormatter, n: ParseTree) {
        const node = <TerminalNode> (n);

        if (PureThriftFormatter._is_EOF(node)) {
            return;
        }

        if (this._indent_s.length > 0) {
            this._push(this._indent_s);
            this._indent_s = '';
        }

        this._push(node.symbol.text!);
    }

}

/*
        self._push(node.symbol.text)

    def DocumentContext(self, node: ThriftParser.DocumentContext):
        self._block_nodes(node.children)

    def HeaderContext(self, node: ThriftParser.HeaderContext):
        self.process_node(node.children[0])

    def DefinitionContext(self, node: ThriftParser.DefinitionContext):
        self.process_node(node.children[0])

    Type_ruleContext = _gen_inline_Context(join='')
    Const_ruleContext = _gen_inline_Context(join='')
    Enum_fieldContext = _gen_inline_Context(
        join=' ',
        tight_fn=lambda _, n: isinstance(n, ThriftParser.List_separatorContext))
    Field_ruleContext = _gen_inline_Context(join='')
    Type_ruleContext = _gen_inline_Context(join='')
    Type_annotationContext = _gen_inline_Context(join='')
    Type_idContext = _gen_inline_Context(join='')
    Type_listContext = _gen_inline_Context(join='')
    Type_mapContext = _gen_inline_Context(join='')
    Type_setContext = _gen_inline_Context(join='')
    Type_baseContext = _gen_inline_Context(join='')
    Type_identifierContext = _gen_inline_Context(join='')
    Include_Context = _gen_inline_Context()
    Namespace_Context = _gen_inline_Context()
    Typedef_Context = _gen_inline_Context()
    Base_typeContext = _gen_inline_Context()
    Field_typeContext = _gen_inline_Context()
    Real_base_typeContext = _gen_inline_Context()
    Const_ruleContext = _gen_inline_Context()
    Const_valueContext = _gen_inline_Context()
    IntegerContext = _gen_inline_Context()
    Container_typeContext = _gen_inline_Context(join='')
    Set_typeContext = _gen_inline_Context(join='')
    List_typeContext = _gen_inline_Context(join='')
    Cpp_typeContext = _gen_inline_Context()
    Const_mapContext = _gen_inline_Context()
    Const_map_entryContext = _gen_inline_Context()
    List_separatorContext = _gen_inline_Context()
    Field_idContext = _gen_inline_Context(join='')
    Field_reqContext = _gen_inline_Context()
    Map_typeContext = _gen_inline_Context(
        tight_fn=lambda i, n: not ThriftFormatter._is_token(n.parent.children[i-1], ','))
    Const_listContext = _gen_inline_Context(
        tight_fn=lambda _, n: isinstance(n, ThriftParser.List_separatorContext))
    Enum_ruleContext = _gen_subfields_Context(3, ThriftParser.Enum_fieldContext)
    Struct_Context = _gen_subfields_Context(3, ThriftParser.FieldContext)
    Union_Context = _gen_subfields_Context(3, ThriftParser.FieldContext)
    ExceptionContext = _gen_subfields_Context(3, ThriftParser.FieldContext)
    FieldContext = _gen_inline_Context(
        tight_fn=lambda _, n: isinstance(n, ThriftParser.List_separatorContext))
    Function_Context = _gen_inline_Context(
        tight_fn=lambda i, n:
            ThriftFormatter._is_token(n, '(') or
            ThriftFormatter._is_token(n, ')') or
            ThriftFormatter._is_token(n.parent.children[i-1], '(') or
            isinstance(n, ThriftParser.List_separatorContext)
    )
    OnewayContext = _gen_inline_Context()
    Function_typeContext = _gen_inline_Context()
    Throws_listContext = _gen_inline_Context(
        tight_fn=lambda i, n:
            ThriftFormatter._is_token(n, '(') or
            ThriftFormatter._is_token(n, ')') or
            ThriftFormatter._is_token(n.parent.children[i-1], '(') or
            isinstance(n, ThriftParser.List_separatorContext)
    )
    Type_annotationsContext = _gen_inline_Context()
    Type_annotationContext = _gen_inline_Context(
        tight_fn=lambda _, n: isinstance(n, ThriftParser.List_separatorContext))
    Annotation_valueContext = _gen_inline_Context()

    def ServiceContext(self, node: ThriftParser.ServiceContext):
        fn = self._gen_subfields_Context(3, ThriftParser.Function_Context)
        if isinstance(node.children[2], TerminalNodeImpl):
            if node.children[2].symbol.text == 'extends':
                fn = self._gen_subfields_Context(5, ThriftParser.Function_Context)

        return fn(self, node)

    def SenumContext(self, node: ThriftParser.SenumContext):
        # deprecated
        pass


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