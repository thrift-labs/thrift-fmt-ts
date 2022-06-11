import 'mocha';
import assert  from 'assert';

import { ThriftData } from 'thirft-parser-ts';
import { PureThriftFormatter } from '../src/index'

describe('status integration tests', () => {
    it('should return hello world', () => {
        const rawThrift = 'include    "shared.thrift" ';
        const data = ThriftData.from_string(rawThrift);
        const fmt = new PureThriftFormatter();
        const thrift = fmt.format_node(data.document);
        // expect(thrift).toBe('hello world');
    })
});
