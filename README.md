# thrift-fmt-ts

typescript implement of `thrift-fmt` https://github.com/thrift-labs/thrift-fmt

typescript parser `thrift-parser-ts` https://github.com/thrift-labs/thrift-parser/tree/master/typescript

## Usage

```typescript
import { ThriftData } from 'thrift-parser-ts';
import { ThriftFormatter, newOption } from 'thrift-fmt-ts'

const thrift = ThriftData.fromString(`const string name="hello"//hello`);
const fmt = new ThriftFormatter(thrift);
fmt.option(newOption({keepComment: true, alignByAssign: true}));
const content = fmt.format();

// const string name = "hello" // hello
console.log(content);
```

## Feature

1. keep and align all comments
2. patch list separator
3. patch missed field's `required` flag
4. align by the field's assign (like go)
5. align by each field's part
6. format only part of the parsed thrift
7. optionally separate `Base` / `BaseResp` fields from preceding struct fields with one blank line

Enable the rule with `newOption({separateBaseFields: true})`; it is disabled by default.
It matches the field name and the final segment of its type: `Base Base`,
`base.Base Base`, `BaseResp BaseResp`, or `base.BaseResp BaseResp`.
It does not depend on the struct name or field ID. A first or only field gets
no leading blank line. Leading comments stay with the field, with the separator
placed before the comments. Existing separators normalize to one blank line.

```typescript
const fmt = new ThriftFormatter(ThriftData.fromString(source));
fmt.option(newOption({separateBaseFields: true}));
const content = fmt.format();
```

```thrift
struct ExampleReq {
    1: optional string Name,

    // Common request metadata
    255: optional base.Base Base,
}
```

## Other

used by https://github.com/thrift-labs/thrift-fmt-vscode

# LICENSE

some thrift files in fixtures thrift was copy from https://github.com/apache/thrift/blob/master/tutorial/ , The Apache LICENSE

the Thrift.g4 in thrift-parser package was copy from https://github.com/antlr/grammars-v4
