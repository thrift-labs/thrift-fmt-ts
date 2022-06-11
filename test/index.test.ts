import 'mocha';
import assert  from 'assert';

import { ThriftData } from 'thrift-parser-ts';
import { PureThriftFormatter, ThriftFormatter } from '../src/index'

describe('Test PureThriftFormatter', () => {
    it('test simple ', () => {
        const rawThrift = 'include    "shared.thrift" ';
        const data = ThriftData.from_string(rawThrift);
        const fmt = new PureThriftFormatter();
        const thrift = fmt.format_node(data.document);
        assert.equal(thrift, 'include "shared.thrift"');
    })
});


describe('test ThriftFormatter', () => {
    it('with align comment', () => {
        const rawThrift = `include    "shared.thrift"   // a
        // work info
        struct Work {
        1: i32 num1 = 0,
            2: required i32 num2, // num2 for
            3: Operation op, // op is Operation
            4: optional string comment,
            5: map<string,list<string>> tags, //hello
        }`;
        const data = ThriftData.from_string(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(true, false);
        const thrift = fmt.format();
const expectThrift = `include "shared.thrift" // a

// work info
struct Work {
    1: i32 num1 = 0,
    2: required i32 num2,              // num2 for
    3: Operation op,                   // op is Operation
    4: optional string comment,
    5: map<string, list<string>> tags, //hello
}`
        assert.equal(thrift, expectThrift);
    })
});

describe('test ThriftData', () => {
    it('load invalid thrift', () => {
        const rawThrift = `include    "shared.thrift`;
        try {
            const data = ThriftData.from_string(rawThrift);
        } catch (error) {
            assert.ok(error);
        }
    })
});
