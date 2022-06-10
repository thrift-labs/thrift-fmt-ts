import { ThriftData } from 'thrift-parser-antlr4';

export function hello(): ThriftData {
    return ThriftData.from_str('hello world');
}

export class PureThriftFormatter {

}