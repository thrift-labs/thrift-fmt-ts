import { CommonToken } from 'antlr4ts';
import { ParseTree, TerminalNode } from 'antlr4ts/tree';
import { ThriftData, ThriftParser, CommentChannel } from 'thrift-parser-ts';
import * as ThriftParserNS from 'thrift-parser-ts/lib/ThriftParser';

type IsKindFunc = (node: ParseTree) => boolean;
type TightFN = (index: number, node: ParseTree) => boolean;
type NodeProcessFunc = (this: PureThriftFormatter, node: ParseTree) => void;
type FieldContext = ThriftParserNS.FieldContext|ThriftParserNS.Enum_fieldContext

export interface Option {
  indent: number,
  patchRequired: boolean,
  patchSeparator: boolean,
  keepComment: boolean,
  alignByAssign: boolean,
  alignByField: boolean,
}

export const newOption = (opt?: Partial<Option>):Option => {
  const defaultOption: Option = {
    indent: 4,
    patchRequired: true,
    patchSeparator: true,
    keepComment: true,
    alignByAssign: false,
    alignByField: false,
  }
  return {
    ...defaultOption,
    ...opt,
  }
}

export const isToken = (node: ParseTree | undefined, text: string): boolean => {
    return node instanceof TerminalNode && node.symbol.text === text;
}

export const isEOF = (node: ParseTree): boolean => {
  return node instanceof TerminalNode && node.symbol.type === ThriftParser.EOF;
}

const notSameClass = (a:ParseTree, b: ParseTree): boolean => {
  return a.constructor.name !== b.constructor.name
}

const isNeedNewLineNode = (node: ParseTree): boolean => {
  return (
    node instanceof ThriftParserNS.Enum_ruleContext ||
    node instanceof ThriftParserNS.Struct_Context ||
    node instanceof ThriftParserNS.Union_Context ||
    node instanceof ThriftParserNS.Exception_Context ||
    node instanceof ThriftParserNS.ServiceContext
  );
}

const isFunctionOrThrowsListNode = (node: ParseTree): boolean => {
  return (
    node instanceof ThriftParserNS.Function_Context ||
    node instanceof ThriftParserNS.Throws_listContext
  );
}

const isFieldOrEnumField = (node: ParseTree|undefined): boolean => {
  return (
    node instanceof ThriftParserNS.FieldContext ||
    node instanceof ThriftParserNS.Enum_fieldContext)
}

const splitFieldChildrenByAssign = (node: FieldContext):[ParseTree[], ParseTree[]] => {
  const children: ParseTree[] = node.children || [];

  let i = 0;
  let curLeft = true;
  for (;i < node.childCount; i++) {
    const child = node.getChild(i);
    if (isToken(child, '=') || (child instanceof ThriftParserNS.List_separatorContext)){
      curLeft = false;
      break
    }
  }
  // current child is belong to left.
  if (curLeft) {
    i++;
  }

  const left = children.slice(0, i);
  const right = children.slice(i);
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

const getSplitFieldsLeftRightSize = (fields: ParseTree[]):[number, number] => {
  let leftMaxSize = 0;
  let rightMaxSize = 0;

  for (const field of fields) {
    const node = <FieldContext> field;
    const [left, right] = splitFieldByAssign(node);
    const leftSize = new PureThriftFormatter().formatNode(left).length;
    const rightSize = new PureThriftFormatter().formatNode(right).length;
    leftMaxSize = leftMaxSize > leftSize?leftMaxSize:leftSize;
    rightMaxSize = rightMaxSize > rightSize?rightMaxSize:rightSize;
  }
  return [leftMaxSize, rightMaxSize];
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
    const node = stack.shift();
    if (node === undefined) {
      break;
    }
    callback(node);
    const children = getNodeChildren(node);
    children.forEach(value => stack.push(value))
  }
}

export const splitRepeatNodes = (nodes: ParseTree[], kindFn: IsKindFunc): [ParseTree[], ParseTree[]] => {
  const children = [];
  for (const [index, node] of nodes.entries()) {
    if (!kindFn(node)) {
      return [children, nodes.slice(index)];
    }
    children.push(node);
  }
  return [children, []];
}

const genInlineContext = (join = ' ', tightFn?: TightFN | undefined): NodeProcessFunc => {
  return function (this: PureThriftFormatter, node: ParseTree) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.getChild(i);
      if (i > 0 && join.length > 0) {
        if (!tightFn || !tightFn(i, child)) {
          this.append(join);
        }
      }
      this.processNode(child);
    }
  };
}

const genSubblocksContext = (start: number, kindFn: IsKindFunc): NodeProcessFunc => {
  return function (this: PureThriftFormatter, node: ParseTree) {
    const children = getNodeChildren(node);
    this.processInlineNodes(children.slice(0, start));
    this.newline();

    const leftChildren = children.slice(start);
    const [subblocks, leftNodes] = splitRepeatNodes(leftChildren, kindFn);

    this.beforeSubblocks(subblocks);
    this.processBlockNodes(subblocks, ' '.repeat(this._option.indent));
    this.afterSubblocks(subblocks);

    this.newline();
    this.processInlineNodes(leftNodes);
  };
}

const tupleTightInline = genInlineContext(
  ' ',
  (i, n) =>
    isToken(n, '(') ||
    isToken(n, ')') ||
    isToken(n.parent?.getChild(i - 1), '(') ||
    n instanceof ThriftParserNS.List_separatorContext
);

const listSeparatorInline = genInlineContext(
  ' ',
  (_, node) => node instanceof ThriftParserNS.List_separatorContext
);

export class PureThriftFormatter {
  protected _option: Option = newOption();
  protected currentIndent = '';
  protected newlineCounter = 0;
  private _out = '';

  formatNode(node: ParseTree): string {
    this._out = '';
    this.newlineCounter = 0;
    this.currentIndent = '';

    this.processNode(node);
    return this._out;
  }

  option(opt: Option) {
    this._option = opt;
  }

  get out(): string {
    return this._out;
  }

  private push(text: string) {
    this._out += text;
  }

  // if this.newlineCounter was set. `append` will first write newlines and then append
  protected append(text: string) {
    if (this.newlineCounter > 0) {
      this.push('\n'.repeat(this.newlineCounter));
      this.newlineCounter = 0;
    }
    this.push(text);
  }

  // appendCurrentLine append to current line, and  ignore this.newlineCounter.
  protected appendCurrentLine(text: string) {
    this.push(text);
  }

  protected newline(repeat = 1) {
    const diff = repeat - this.newlineCounter;
    if (diff > 0) {
      this.newlineCounter += diff;
    }
  }

  protected setCurrentIndent(indent = '') {
    this.currentIndent = indent;
  }

  protected pushCurrentIndent() {
    if (this.currentIndent.length > 0) {
      this.append(this.currentIndent);
    }
  }

  protected beforeBlockNode(_: ParseTree): void {} // eslint-disable-line
  protected afterBlockNode(_: ParseTree): void {}  // eslint-disable-line
  protected beforeSubblocks(_: ParseTree[]) {} // eslint-disable-line
  protected afterSubblocks(_: ParseTree[]) {}  // eslint-disable-line
  protected beforeProcessNode(_: ParseTree) {} // eslint-disable-line
  protected afterProcessNode(_: ParseTree) {}  // eslint-disable-line

  protected processBlockNodes(nodes: ParseTree[], indent = '') {
    let lastNode: ParseTree | undefined = undefined;
    // eslint-disable-next-line
    for (let [index, node] of nodes.entries()) {
      if (
        node instanceof ThriftParserNS.HeaderContext ||
        node instanceof ThriftParserNS.DefinitionContext
      ) {
        node = node.getChild(0);
      }

      this.beforeBlockNode(node)

      if (index > 0 && lastNode !== undefined) {
        if (notSameClass(lastNode, node)|| isNeedNewLineNode(node)) {
          this.newline(2);
        } else {
          this.newline();
        }
      }

      this.setCurrentIndent(indent);
      this.processNode(node);

      this.afterBlockNode(node);
      lastNode = node;
    }
  }

  protected processInlineNodes(nodes: ParseTree[], join = ' ') {
    // eslint-disable-next-line
    for (let [index, node] of nodes.entries()) {
      if (index > 0) {
        this.append(join);
      }
      this.processNode(node);
    }
  }

  protected processNode(node: ParseTree): void {
    this.beforeProcessNode(node)
    this._processNode(node)
    this.afterProcessNode(node)
  }

  private _processNode(node: ParseTree): void {
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
      // unsupport node
    }
  }

  protected TerminalNode(node: TerminalNode) {
    if (isEOF(node)) {
      return;
    }

    this.pushCurrentIndent();
    this.setCurrentIndent('');

    this.append(node.symbol.text || '');
  }

  protected DocumentContext: NodeProcessFunc = function (this: PureThriftFormatter, node: ParseTree) {
    const children = getNodeChildren(node);
    this.processBlockNodes(children);
  };

  protected HeaderContext: NodeProcessFunc = function (this: PureThriftFormatter,node: ParseTree) {
    this.processNode(node.getChild(0));
  };

  protected DefinitionContext: NodeProcessFunc = function (this: PureThriftFormatter, node: ParseTree) {
    this.processNode(node.getChild(0));
  };

  // TODO: clean this?
  protected Include_Context: NodeProcessFunc = genInlineContext();
  protected Namespace_Context: NodeProcessFunc = genInlineContext();
  protected Typedef_Context: NodeProcessFunc = genInlineContext();
  protected Base_typeContext: NodeProcessFunc = genInlineContext();
  protected Field_typeContext: NodeProcessFunc = genInlineContext();
  protected Real_base_typeContext: NodeProcessFunc = genInlineContext();
  protected Const_ruleContext: NodeProcessFunc = genInlineContext();
  protected Const_valueContext: NodeProcessFunc = genInlineContext();
  protected IntegerContext: NodeProcessFunc = genInlineContext();
  protected Container_typeContext: NodeProcessFunc = genInlineContext('');
  protected Set_typeContext: NodeProcessFunc = genInlineContext('');
  protected List_typeContext: NodeProcessFunc = genInlineContext('');
  protected Cpp_typeContext: NodeProcessFunc = genInlineContext();
  protected Const_mapContext: NodeProcessFunc = genInlineContext();
  protected Const_map_entryContext: NodeProcessFunc = genInlineContext();
  protected List_separatorContext: NodeProcessFunc = genInlineContext();
  protected Field_idContext: NodeProcessFunc = genInlineContext('');
  protected Field_reqContext: NodeProcessFunc = genInlineContext();
  protected Map_typeContext: NodeProcessFunc = genInlineContext(
    ' ',
    (i, n) => !isToken(n.parent?.getChild(i - 1), ',')
  );
  protected Const_listContext: NodeProcessFunc = listSeparatorInline
  protected Enum_ruleContext: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.Enum_fieldContext
  );
  protected Enum_fieldContext: NodeProcessFunc = listSeparatorInline
  protected Struct_Context: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  protected Union_Context: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  protected Exception_Context: NodeProcessFunc = genSubblocksContext(
    3,
    (n) => n instanceof ThriftParserNS.FieldContext
  );
  protected FieldContext: NodeProcessFunc = listSeparatorInline
  protected Function_Context: NodeProcessFunc = tupleTightInline
  protected OnewayContext: NodeProcessFunc = genInlineContext();
  protected Function_typeContext: NodeProcessFunc = genInlineContext();
  protected Throws_listContext: NodeProcessFunc = tupleTightInline
  protected Type_annotationsContext: NodeProcessFunc = tupleTightInline
  protected Type_annotationContext: NodeProcessFunc = tupleTightInline
  protected Annotation_valueContext: NodeProcessFunc = genInlineContext();
  protected ServiceContext_Default: NodeProcessFunc = genSubblocksContext(
    3,
    (n:ParseTree) => n instanceof ThriftParserNS.Function_Context
  );
  protected ServiceContext_Extends: NodeProcessFunc = genSubblocksContext(
    5,
    (n:ParseTree) => n instanceof ThriftParserNS.Function_Context
  );
  protected ServiceContext: NodeProcessFunc = function (this: PureThriftFormatter, n: ParseTree) {
    const node = <ThriftParserNS.ServiceContext>n;
    if (isToken(node.getChild(2), 'extends')) {
      this.ServiceContext_Extends(node);
    } else {
      this.ServiceContext_Default(node);
    }
  };
  protected SenumContext: NodeProcessFunc = function (this: PureThriftFormatter, _:ParseTree) {}; // eslint-disable-line
}

const patchFieldRequired = (n: ParseTree): void => {
  if (!(n instanceof ThriftParserNS.FieldContext)) {
    return;
  }

  if (n.parent === undefined || isFunctionOrThrowsListNode(n.parent)) {
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

  const fakeToken = new CommonToken(ThriftParser.T__20, 'required');
  fakeToken.line = -1;
  fakeToken.charPositionInLine = -1;
  fakeToken.tokenIndex = -1;
  const fakeNode = new TerminalNode(fakeToken);
  const fakeReq = new ThriftParserNS.Field_reqContext(n, 0);

  fakeNode.setParent(fakeReq);
  fakeReq.addChild(fakeNode);
  fakeReq.setParent(n);
  n.children?.splice(i, 0, fakeReq); // addChild
}

const patchFieldListSeparator = (n: ParseTree): void => {
  if (!(n instanceof ThriftParserNS.Enum_fieldContext
    || n instanceof ThriftParserNS.FieldContext
    || n instanceof ThriftParserNS.Function_Context)) {
    return;
  }
  const child = n.getChild(n.childCount - 1);
  if (child instanceof ThriftParserNS.List_separatorContext) {
    const comma = <TerminalNode>child.getChild(0);
    const token = <CommonToken> comma.symbol;
    token.text = ',';
    return;
  }

  const fakeToken = new CommonToken(ThriftParser.COMMA, ',');
  fakeToken.line = -1;
  fakeToken.charPositionInLine = -1;
  fakeToken.tokenIndex = -1;
  const fakeNode = new TerminalNode(fakeToken);
  const fakeCtx = new ThriftParserNS.List_separatorContext(n, 0);

  fakeNode.setParent(fakeCtx);
  fakeCtx.addChild(fakeNode);

  fakeCtx.setParent(n);
  n.addChild(fakeCtx);
}

const patchRemoveLastListSeparator = (n: ParseTree): void => {
  const isInlineField = n instanceof ThriftParserNS.FieldContext
    && n.parent !== undefined && isFunctionOrThrowsListNode(n.parent);
  const isInlineNode = n instanceof ThriftParserNS.Type_annotationContext;

  if (!(isInlineField || isInlineNode)) {
    return;
  }

  if (n.parent === undefined) {
    return;
  }

  let last = false;
  const brothers = n.parent.children || [];
  const bortherCount = n.parent.childCount;
  for (let i = 0; i < bortherCount; i++) {
    if (brothers[i] === n) {
      if (i === bortherCount - 1 || notSameClass(n, brothers[i + 1])) {
        last = true;
        break;
      }
    }
  }

  if (last) {
    const child = n.getChild(n.childCount - 1);
    if (child instanceof ThriftParserNS.List_separatorContext) {
      n.removeLastChild();
    }
  }
}

const calcSubBlocksCommentPadding = (subblocks: ParseTree[]): number => {
  let padding = 0;
  for (const subblock of subblocks) {
    const nodeLength = (new PureThriftFormatter().formatNode(subblock)).length;
    padding = padding >= nodeLength? padding: nodeLength;
  }
  if (padding > 0) {
    padding = padding + 1;
  }
  return padding;
}

export const calcFieldAlignByAssignPadding = (fields: ParseTree[]): [number, number] => {
  if (fields.length === 0 || !isFieldOrEnumField(fields[0]) ) {
    return  [0, 0];
  }

  const [leftMaxSize, rightMaxSize] = getSplitFieldsLeftRightSize(fields);
  // add extra space "xxx = yyy" -> "xxx" + " " + "= yyy"
  const assignPadding = leftMaxSize + 1;
  let commentPadding = assignPadding + rightMaxSize + 1; // add an extra space for next comment
  /*
      if it is not list sep, need add extra space
      case 1 --> "1: bool a = true," ---> "1: bool a" + " " + "= true,"
      case 2 --> "2: bool b," ---> "2: bool b" + "" + ","
  */
  if (rightMaxSize <= 1) { // case 1
    commentPadding = commentPadding - 1;
  }
  return [assignPadding, commentPadding];
}

const getFieldChildName = (n: ParseTree): string =>  {
  if (isToken(n, '=')) {
    return '='
  }
  return n.constructor.name;
}

const calcFieldAlignByFieldPaddingMap = (fields: ParseTree[]):[Map<string, number>, number] => {
  const paddingMap: Map<string, number> = new Map();
  if (fields.length == 0 || !isFieldOrEnumField(fields[0])) {
    return [paddingMap, 0];
  }

  const nameLevels: Map<string, number> = new Map();
  for (const field of fields) {
    let i = 0;
    for (;i < field.childCount -1; i++) {
      const nameA = getFieldChildName(field.getChild(i))
      const nameB = getFieldChildName(field.getChild(i+1))
      if (!nameLevels.has(nameA)) {
        nameLevels.set(nameA, 0);
      }
      if (!nameLevels.has(nameB)) {
        nameLevels.set(nameB, 0);
      }
      const levelB = Math.max(nameLevels.get(nameB)!, nameLevels.get(nameA)! +1);  // eslint-disable-line
      nameLevels.set(nameB, levelB);
    }
  }

  // 检查 levles 连续
  if (Math.max(...nameLevels.values()) != (nameLevels.size -1)) {
    return [paddingMap, 0];
  }

  const levelLength: Map<number, number> = new Map();
  for (const field of fields) {
    let i = 0;
    for (;i < field.childCount; i++) {
      const child = field.getChild(i)
      const level = nameLevels.get(getFieldChildName(child))! // eslint-disable-line
      const length = new PureThriftFormatter().formatNode(child).length

      levelLength.set(level, Math.max(levelLength.get(level) || 0, length))
    }
  }

  const sep = new ThriftParserNS.List_separatorContext(undefined, 0);
  const levelPadding: Map<number, number> = new Map();
  for (const [level, ] of levelLength) {
    let padding = level;
    if (level === nameLevels.get(getFieldChildName(sep))) {
      padding -= 1;
    }

    let i = 0;
    for (;i < level; i++) {
      padding += levelLength.get(i) || 0;
    }

    levelPadding.set(level, padding)
  }

  for (const [name, level] of nameLevels) {
    paddingMap.set(name, levelPadding.get(level)!) // eslint-disable-line
  }

  let commentPadding = levelLength.size
  for (const [, length] of levelLength) {
    commentPadding += length
  }
  if (paddingMap.has(getFieldChildName(sep))) {
    commentPadding -= 1
  }

  return [paddingMap, commentPadding];
}

export class ThriftFormatter extends PureThriftFormatter {
  private data: ThriftData;
  private document: ThriftParserNS.DocumentContext;

  private fieldCommentPadding = 0;
  private fieldAlignByAssignPadding = 0;
  private fieldAlignByFieldPaddingMap: Map<string, number> = new Map();
  private lastTokenIndex = -1;

  constructor(data: ThriftData) {
    super();

    this.data = data;
    this.document = data.document;
  }

  format(): string {
    this.patch();
    return this.formatNode(this.document);
  }

  public patch() {
    if (this._option.patchRequired) {
      walkNode(this.document, patchFieldRequired);
    }
    if (this._option.patchSeparator) {
      walkNode(this.document, patchFieldListSeparator);
      walkNode(this.document, patchRemoveLastListSeparator);
    }
  }

  protected beforeSubblocks(subblocks: ParseTree[]) {
    if (this._option.alignByField) {
      const [paddingMap, commentPadding] = calcFieldAlignByFieldPaddingMap(subblocks)
      paddingMap.forEach((value, key, m) => {m.set(key, this.calcAddIndentPadding(value))})
      this.fieldAlignByFieldPaddingMap = paddingMap
      this.fieldCommentPadding = this.calcAddIndentPadding(commentPadding)
    } else if (this._option.alignByAssign) {
      const [alignPadding, commentPadding] = calcFieldAlignByAssignPadding(subblocks)
      this.fieldAlignByAssignPadding = this.calcAddIndentPadding(alignPadding)
      this.fieldCommentPadding = this.calcAddIndentPadding(commentPadding)
    }

    if (this._option.keepComment && this.fieldCommentPadding === 0) {
      const commentPadding = calcSubBlocksCommentPadding(subblocks)
      this.fieldCommentPadding = this.calcAddIndentPadding(commentPadding)
    }
  }

  protected afterSubblocks(_: ParseTree[]): void {
    this.fieldAlignByAssignPadding = 0;
    this.fieldAlignByFieldPaddingMap = new Map();
    this.fieldCommentPadding = 0;
  }

  protected afterBlockNode(_: ParseTree): void {
    this.addTailComment();
  }

  protected beforeProcessNode(n: ParseTree): void {
    this.addAlignPadding(n)
  }

  protected get currentLine() :string {
    if (this.newlineCounter > 0) {
      return '';
    }

    const parts = this.out.split('\n');
    const cur = parts[parts.length -1];
    return cur;
  }

  private calcAddIndentPadding(padding:number) : number {
    if (padding > 0) {
      padding += this._option.indent
    }
    return padding
  }

  private addAlignPadding(n: ParseTree) {
    if (!isFieldOrEnumField(n.parent)) {
      return
    }

    if (this._option.alignByField && this.fieldAlignByFieldPaddingMap.size > 0) {
      const name = getFieldChildName(n)
      const padding = this.fieldAlignByFieldPaddingMap.get(name)
      if (padding && padding > 0) {
        this.padding(padding)
      }
      return
    }

    if (this._option.alignByAssign && isToken(n, '=') ) {
      this.padding(this.fieldAlignByAssignPadding)
      return
    }
    return
  }

  private padding(padding: number, pad = ' ') {
    if (padding > 0) {
      padding = padding - this.currentLine.length;
      if (padding > 0) {
        this.appendCurrentLine(pad.repeat(padding));
      }
    }
  }

  private addInlineComments(node: TerminalNode) {
    if (!this._option.keepComment) {
      return;
    }

    // fake_token
    if (node.symbol.line === -1) {
      return;
    }

    const tokenIndex = node.symbol.tokenIndex;
    const comments = [];
    const tokens = this.data.tokens.getTokens();
    for (const token of tokens.slice(this.lastTokenIndex + 1)) {
      if (token.channel != CommentChannel) {
        continue;
      }
      if (token.tokenIndex < tokenIndex) {
        comments.push(token);
      }
    }

    for (const token of comments) {
      if (token.tokenIndex > 0 && token.type == ThriftParser.ML_COMMENT) {
        this.newline(2);
      }
      if (token.text === undefined) {
        return;
      }

      // TODO: 确认是否需要 clean indent;
      this.pushCurrentIndent();

      const text = token.text;
      this.append(text.trim());

      const lastLine = token.line + text.split('\n').length - 1;
      const lineDiff = node.symbol.line - lastLine;
      const isTight =
        token.type == ThriftParser.SL_COMMENT ||
        isEOF(node) ||
        (0 < lineDiff && lineDiff <= 1);

      if (isTight) {
        this.newline();
      } else {
        this.newline(2);
      }
    }

    this.lastTokenIndex = tokenIndex;
  }

  private addTailComment() {
    if (!this._option.keepComment) {
      return;
    }
    if (this.lastTokenIndex === -1) {
      return;
    }
    const tokens = this.data.tokens.getTokens();
    const lastToken = tokens[this.lastTokenIndex];
    const comments = [];
    for (const token of tokens.slice(this.lastTokenIndex + 1)) {
      if (token.line != lastToken.line) {
        break;
      }
      if (token.channel != CommentChannel) {
        continue;
      }
      comments.push(token);
    }

    if (comments.length > 0) {
      const comment = comments[0];
      if (comment.text === undefined) {
        return;
      }
      // align comment
      if (this.fieldCommentPadding > 0) {
        this.padding(this.fieldCommentPadding, ' ');
      } else {
        this.appendCurrentLine(' ');
      }

      this.appendCurrentLine(comment.text.trim());
      this.append('');
      this.lastTokenIndex = comment.tokenIndex;
    }
  }

  protected TerminalNode(n: TerminalNode) {
    if (this.newlineCounter > 0) {
      this.addTailComment();
    }

    this.addInlineComments(n);

    super.TerminalNode(n);
  }
}
