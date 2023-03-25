# thrift-fmt-ts

typescript implement of `thrift-fmt` https://github.com/thrift-labs/thrift-fmt

typescript parser `thrift-parser-ts` https://github.com/thrift-labs/thrift-parser/tree/master/typescript

## Usage

```typescript
import { ThriftData } from 'thrift-parser-ts';
import { ThriftFormatter, newOption } from 'thrift-fmt-ts'

const data = ThriftData.fromString(`const string name="hello"`);
const fmt = new ThriftFormatter(data);
fmt.option(newOption());
const content = fmt.format();

// const string name = "hello"
console.log(content);
```

## Other

used by https://github.com/thrift-labs/thrift-fmt-vscode

# LICENSE

some thrift files in fixtures thrift was copy from https://github.com/apache/thrift/blob/master/tutorial/ , The Apache LICENSE

the Thrift.g4 in thrift-parser package was copy from https://github.com/antlr/grammars-v4
