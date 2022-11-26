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

    it('test enum', () => {
        const rawThrift = `enum Numberz {
            ONE = 1 ,
            TWO ,
            THREE ,
            FIVE = 5 ,
            SIX ,
            EIGHT = 8
        }`
        const data = ThriftData.from_string(rawThrift);
        const fmt = new PureThriftFormatter();
        const thrift = fmt.format_node(data.document);
        assert.equal(thrift, `enum Numberz {
    ONE = 1,
    TWO,
    THREE,
    FIVE = 5,
    SIX,
    EIGHT = 8
}`);
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
        fmt.option({patch: false, comment:true});
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

    it('with with patch', () => {
        const rawThrift = `include    "shared.thrift"   // a
        // work info
        struct Work {
        1: i32 num1 = 0;
            2: required i32 num2, // num2 for
            3: Operation op, // op is Operation
            4: optional string comment,
            5: map<string,list<string>> tags, //hello
        }`;
        const data = ThriftData.from_string(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option({patch: true, comment:true});
        const thrift = fmt.format();
const expectThrift = `include "shared.thrift" // a

// work info
struct Work {
    1: required i32 num1 = 0,
    2: required i32 num2,                       // num2 for
    3: required Operation op,                   // op is Operation
    4: optional string comment,
    5: required map<string, list<string>> tags, //hello
}`
        assert.equal(thrift, expectThrift);
    })

    it('with with patch field comma', () => {
        const rawThrift = `
        struct Work {
            1: i32 num1 = 0;
            2: i32 num2,
            3: i32 num3
        }`;
        const data = ThriftData.from_string(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(true, true);
        const thrift = fmt.format();
const expectThrift = `struct Work {
    1: required i32 num1 = 0,
    2: required i32 num2,
    3: required i32 num3,
}`
        assert.equal(thrift, expectThrift);
    })

    it('with remove last sep in functions', () => {
        const rawThrift = `
        service NameService {
            void hello(1: string name, 2: i32 age,);
        }
        `;
        const data = ThriftData.from_string(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(true, true);
        const thrift = fmt.format();
const expectThrift = `service NameService {
    void hello(1: string name, 2: i32 age),
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

describe('test with complex literal value', () => {
    it('test double quote', () => {
        const rawThrift = `const string default_user = "\\'default_user\\'";`;
        const data = ThriftData.from_string(rawThrift);
        assert.equal(data.tokens.getTokens().length, 11);
    })

    it('test single quote', () => {
        const rawThrift = `const string default_name = '"abc\\'s"' ;`;
        const data = ThriftData.from_string(rawThrift);
        assert.equal(data.tokens.getTokens().length, 12);
    })
});
