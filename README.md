# thrift-fmt-ts

typescript implement of `thrift-fmt` https://github.com/thrift-labs/thrift-fmt

typescript parser `thrift-parser-ts` https://github.com/thrift-labs/thrift-parser/tree/master/typescript

## Usage

```typescript
import { ThriftData } from 'thrift-parser-ts';
import { ThriftFormatter, newOption } from 'thrift-fmt-ts'


const data = ThriftData.fromString(`const string name="hello"`);
const fomatter = new ThriftFormatter(data);
fomatter.option(newOption());
const newContent = fomatter.format();

console.log(newContent);
```

## Other

used by https://github.com/thrift-labs/thrift-fmt-vscode

