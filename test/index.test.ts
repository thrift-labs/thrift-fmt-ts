import 'mocha';
import assert  from 'assert';

import { ThriftData } from 'thrift-parser-ts';
import { PureThriftFormatter, ThriftFormatter, newOption } from '../src/index'
import { splitFieldByAssign, calcFieldAlignByAssignPadding } from '../src/index'
import * as ThriftParserNS from "thrift-parser-ts/lib/ThriftParser";

describe('Test PureThriftFormatter', () => {
    it('test simple ', () => {
        const rawThrift = 'include    "shared.thrift" ';
        const data = ThriftData.fromString(rawThrift);
        const fmt = new PureThriftFormatter();
        const thrift = fmt.formatNode(data.document);
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
        const data = ThriftData.fromString(rawThrift);
        const fmt = new PureThriftFormatter();
        const thrift = fmt.formatNode(data.document);
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
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({patchRequired:false, patchSeparator: false, keepComment:true}));
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
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({patchRequired:true, patchSeparator: true, keepComment:true}));
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
            2: i32 number2,
            3: i32 num3
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({patchRequired:true, patchSeparator: true, keepComment:true, alignByAssign: false}));
        const thrift = fmt.format();
const expectThrift = `struct Work {
    1: required i32 num1 = 0,
    2: required i32 number2,
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
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({patchRequired:true, patchSeparator: true, keepComment:true, alignByAssign: false}));
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
            ThriftData.fromString(rawThrift);
        } catch (error) {
            assert.ok(error);
        }
    })
});

describe('test with complex literal value', () => {
    it('test double quote', () => {
        const rawThrift = `const string default_user = "\\'default_user\\'";`;
        const data = ThriftData.fromString(rawThrift);
        assert.equal(data.tokens.getTokens().length, 11);
    })

    it('test single quote', () => {
        const rawThrift = `const string default_name = '"abc\\'s"' ;`;
        const data = ThriftData.fromString(rawThrift);
        assert.equal(data.tokens.getTokens().length, 12);
    })
});

describe('test ThriftFormatter with assign algin', () => {
    it('with calc padding', () => {
        const rawThrift = `
        struct Work {
        1: i32 num1 = 0,
        2: required i32 num2, // num2 for
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true}))

        assert.equal(data.document.childCount, 2, data.toString());
        const structValue = <ThriftParserNS.Struct_Context>data.document.getChild(0).getChild(0);
        assert.equal(structValue.childCount, 6, structValue.toString());
        if (structValue.children === undefined) {
            assert.fail("structValue.children is undefined")
            return;
        }
        const fileds = structValue.children.slice(3, 5);
        assert.equal(fileds.length, 2);
        assert.ok(fileds[0] instanceof ThriftParserNS.FieldContext);
        assert.ok(fileds[1] instanceof ThriftParserNS.FieldContext);
        const [p1, p2] = calcFieldAlignByAssignPadding(fileds);
        assert.equal(p1, 21)
        assert.equal(p2, 26)
    })

    it('with calc padding v2', () => {
        const rawThrift = `
        struct Work {
        1: i32 num1 = 0,
        2: required i32 numbers, // num2 for
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true}))

        assert.equal(data.document.childCount, 2, data.toString());
        const structValue = <ThriftParserNS.Struct_Context>data.document.getChild(0).getChild(0);
        assert.equal(structValue.childCount, 6, structValue.toString());
        if (structValue.children === undefined) {
            assert.fail("structValue.children is undefined")
            return;
        }
        const fileds = structValue.children.slice(3, 5);
        assert.equal(fileds.length, 2);
        assert.ok(fileds[0] instanceof ThriftParserNS.FieldContext);
        assert.ok(fileds[1] instanceof ThriftParserNS.FieldContext);
        const [p1, p2] = calcFieldAlignByAssignPadding(fileds);
        assert.equal(p1, 24)
        assert.equal(p2, 29)
    })

    it('check assgin format', () => {
        const rawThrift = `
        enum NUM {
            ONE =1,
            SEVEN = 7,
            ELEVLEN,
        }

        struct Work {
        1: i32 num1 = 0,
        2: required string username = "hello", // name
        3: optional list<map<string, bool>> attrs;
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true}))
        const out = fmt.format();

        assert.equal(out, `enum NUM {
    ONE     = 1,
    SEVEN   = 7,
    ELEVLEN,
}

struct Work {
    1: required i32 num1                      = 0,
    2: required string username               = "hello", // name
    3: optional list<map<string, bool>> attrs,
}`);

    })

    it('check assginsimple', () => {
        const rawThrift = `
        enum NUM {
            ONE = 1,
            SEVEN = 7,
            ELEVLEN,
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true}))
        const out = fmt.format();

        assert.equal(out, `enum NUM {
    ONE     = 1,
    SEVEN   = 7,
    ELEVLEN,
}`);

    })

    it('check test_field_assign_align_for_enum', () => {
        const rawThrift = `enum Numberz {
    ONE = 1,
    TWO,
    THREE,
    FIVE = 5,
    SIX,
    EIGHT = 8 }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true, indent: 4}))
        const out = fmt.format();

        assert.equal(out, `enum Numberz {
    ONE   = 1,
    TWO,
    THREE,
    FIVE  = 5,
    SIX,
    EIGHT = 8,
}`);
    });

    it('check test_field_assign_align_with_complex', () => {
        const rawThrift = `enum NUM {
            ONE =1,
            SEVEN = 7,
            ELEVLEN
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true, indent: 4, patchRequired: false, patchSeparator: false}))
        const out = fmt.format();

        assert.equal(out, `enum NUM {
    ONE     = 1,
    SEVEN   = 7,
    ELEVLEN
}`);
    })

    it('check align by assign with no assign', () => {
        const rawThrift = `struct User {
            1: required string name, // names
            2: required i32 id,// ids
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true, indent: 4, keepComment: true}))
        const out = fmt.format();
        console.log(out);
        assert.equal(out.trim(), `
struct User {
    1: required string name, // names
    2: required i32 id,      // ids
}`.trim());
    })
});

describe('test some function', () =>{
    it('check splitFieldByAssign', () => {
        const rawThrift = `
        struct Work {
        1: i32 num1 = 0,
        2: required i32 numbers, // num2 for
        }`;
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({alignByAssign: true}))

        assert.equal(data.document.childCount, 2, data.toString());
        const structValue = <ThriftParserNS.Struct_Context>data.document.getChild(0).getChild(0);
        const fieldValue = <ThriftParserNS.FieldContext>structValue.getChild(3);
        const [left, right] = splitFieldByAssign(fieldValue);

        assert.ok(left instanceof ThriftParserNS.FieldContext)
        assert.ok(right instanceof ThriftParserNS.FieldContext)
        assert.equal(left.childCount, 3);
        assert.equal(right.childCount, 3);

        const leftValue = new PureThriftFormatter().formatNode(left);
        const rightValue = new PureThriftFormatter().formatNode(right);
        assert.equal(leftValue, `1: i32 num1`)
        assert.equal(rightValue, `= 0,`)
    })
})


describe('test with align field', () => {
    it('with struct enum', () => {
        const rawThrift = `
       struct Person {
           1: list<string> tags = ["A"],
           2: optional list<string> opt_tags = ["1", "2"],
           3: required list<string> req_tags = [],
           4: string name = "hello";
           5: optional string opt_name,
           16: required string req_name,
       }`
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({
            patchRequired: false,
            patchSeparator: true,
            alignByField: true,
            indent:4,
            keepComment: true}))
        const out = fmt.format()
        console.log(out)
        assert.equal(out.trim(), `
struct Person {
    1:           list<string> tags     = [ "A" ]     ,
    2:  optional list<string> opt_tags = [ "1", "2" ],
    3:  required list<string> req_tags = [ ]         ,
    4:           string       name     = "hello"     ,
    5:  optional string       opt_name               ,
    16: required string       req_name               ,
}
            `.trim())
    })

    it('test another simple', ()=> {
        const rawThrift = `
        struct Work {
        1: i32 number_a = 0, // hello
        2: required i32 num2 = 1,//xyz
        3: list<i32> num3 = [1, 2, 3],// num3
        11: string str_b = "hello-world"
        }`
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({
            patchRequired: false,
            patchSeparator: true,
            alignByField: true,
            indent:4,
            keepComment: true}))
        const out = fmt.format()
        console.log(out)
        assert.equal(out.trim(), `
struct Work {
    1:           i32       number_a = 0            , // hello
    2:  required i32       num2     = 1            , //xyz
    3:           list<i32> num3     = [ 1, 2, 3 ]  , // num3
    11:          string    str_b    = "hello-world",
}
        `.trim())
    })
})

describe('test more case to up coverage', () => {
    it('with full thrift support', () => {
        const rawThrift = `/*x
        y*/

       // hello
       include "shared.thrift" // hello3

       /*x

        y*/

       # a
       // b
       include "shared2.thrift" //a

       // gt

       /*xyz
       */

       namespace py hello_thrift

       const i32 person_type_default = 1;
       const list<i32> hello_tags = [1, 2, 3];
       const map<string, i32> default_users = {"1": 2},

       typedef i32 PersionType

       struct Xtruct2 {
           1: required i8 byte_thing,       // used to be byte, hence the name
           2: required Xtruct struct_thing, // b
           3: required i32 i32_thing,       // a
           4: map cpp_type "UserPO" <string, i64> users,
           5: set cpp_type "Name" <string> names,
       }

       struct CrazyNesting {
        1: string string_field,
        2: optional set<Insanity> set_field,
        // Do not insert line break as test/go/Makefile.am is removing this line with pattern match
        3: required list<map<set<i32> (python.immutable = ""), map<i32,set<list<map<Insanity,string>(python.immutable = "")> (python.immutable = "")>>>> list_field,
        4: binary binary_field
      }

      union SomeUnion {
        1: map<Numberz, UserId> map_thing,
        2: string string_thing,
        3: i32 i32_thing,
        4: Xtruct3 xtruct_thing,
        5: Insanity insanity_thing
      }

      exception Xception {
        1: i32 errorCode,
        2: string message
      }



       struct Work {
           1: required i32 num1 = 0,
           2: required i32 num2,                       // num2 for
           // 3: required Operation op,                // op is Operation
           4: optional string comment,
           5: required map<string, list<string>> tags, //hello
       }

       struct Person {
           1: list<string> tags,
           2: optional list<string> opt_tags = ["1", "2"],
           3: required list<string> req_tags = [],
           4: string name = "hello";
           5: optional string opt_name,
           6: required string req_name,
       }

       service HelloService {
            oneway void testOneway(1:i32 secondsToSleep)
            Xtruct testMultiException(1: string arg0, 2: string arg1) throws(1: Xception err1, 2: Xception2 err2)
       }
       service Hello2Service extends HelloService {
       }

    enum WEEKDAY {
        MONDAY,
        SUNDAY = 2;
    }
    senum STRS {
    } `
        const data = ThriftData.fromString(rawThrift);
        const fmt = new ThriftFormatter(data);
        fmt.option(newOption({
            patchRequired: true,
            patchSeparator: true,
            alignByAssign: false,
            alignByField: true,
            indent: 4,
            keepComment: true}))
        fmt.format()
    })
})