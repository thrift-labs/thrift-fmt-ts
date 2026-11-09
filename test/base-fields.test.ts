import 'mocha';
import assert from 'assert';
import { ThriftData } from 'thrift-parser-ts';
import { newOption, Option, PureThriftFormatter, ThriftFormatter } from '../src/index';

const format = (source: string, option: Partial<Option> = { separateBaseFields: true }): string => {
  const fmt = new ThriftFormatter(ThriftData.fromString(source));
  fmt.option(newOption(option));
  return fmt.format();
};

describe('Optional Base / BaseResp field separation', () => {
  const fields = ['Base Base', 'base.Base Base', 'common.meta.Base Base',
    'BaseResp BaseResp', 'base.BaseResp BaseResp'];

  for (const field of fields) {
    for (const option of [{}, { alignByAssign: true }, { alignByField: true, indent: 2 },
      { patchRequired: false, patchSeparator: false, keepComment: false }]) {
      it(`separates ${field} with ${JSON.stringify(option)} and stays stable`, () => {
        const source = `struct ArbitraryName {1: optional string Name, 42: optional ${field},}`;
        const opts = { ...option, separateBaseFields: true };
        const out = format(source, opts);
        assert.equal(out.split('\n').length, 5);
        assert.equal(out.split('\n')[2], '');
        assert.equal(format(out, opts), out);
      });
    }
    it(`does not separate ${field} by default or when disabled`, () => {
      assert.equal(newOption().separateBaseFields, false);
      const source = `struct Example {1: string Name, 255: ${field}}`;
      const fmt = new ThriftFormatter(ThriftData.fromString(source));
      const expected = `struct Example {\n    1: required string Name,\n    255: required ${field},\n}`;
      assert.equal(fmt.format(), expected);
      assert.equal(format(source, { separateBaseFields: false }), expected);
    });
    for (const tail of ['', '\n1: string Name,']) {
      it(`does not add a leading blank line to first field ${field} with tail ${tail}`, () => {
        assert.ok(!format(`struct Example {255: ${field},${tail}}`).includes('\n\n'));
      });
    }
  }

  for (const gap of ['', '\n', '\n\n\n']) {
    it(`normalizes the separator with source gap ${JSON.stringify(gap)}`, () => {
      assert.equal(format(`struct Example {\n1: string Name,\n${gap}255: base.Base Base,\n}`),
        'struct Example {\n    1: required string Name,\n\n    255: required base.Base Base,\n}');
    });
  }

  for (const field of ['string Base', 'base.Base OtherName', 'base.Base BaseResp',
    'base.BaseResp Base', 'base.Base base', 'list<base.Base> Base']) {
    it(`does not separate mismatched or container field ${field}`, () => {
      assert.ok(!format(`struct Example {1: string Name, 255: ${field}}`).includes('\n\n'));
    });
  }

  for (const kind of ['union', 'exception']) {
    it(`does not change ${kind} fields`, () => {
      assert.ok(!format(`${kind} Example {1: string Name, 255: base.Base Base}`).includes('\n\n'));
    });
  }

  for (const comment of ['// Metadata', '// Metadata\n// Context', '/* Metadata */',
    '/* Metadata\ncontext */', '/* Metadata */\n/* Context */']) {
    for (const option of [{}, { alignByAssign: true }, { alignByField: true },
      { patchRequired: false, patchSeparator: false }]) {
      it(`keeps ${JSON.stringify(comment)} with the field using ${JSON.stringify(option)}`, () => {
        const opts = { ...option, separateBaseFields: true };
        const source = `struct Example {\n1: string Name, // Business\n${comment}\n\n255: base.Base Base, // Metadata\n}`;
        const out = format(source, opts);
        assert.ok(out.includes('// Business\n\n    ' + comment.split('\n')[0]));
        assert.ok(!out.includes(comment.split('\n').pop() + '\n\n'));
        assert.equal(format(out, opts), out);
      });
    }
    it(`keeps first-field ${JSON.stringify(comment)} without a leading gap`, () => {
      const out = format(`struct Example {\n${comment}\n\n255: base.Base Base\n}`);
      assert.ok(out.startsWith('struct Example {\n    ' + comment.split('\n')[0]));
      assert.ok(!out.includes('\n\n'));
      assert.equal(format(out), out);
    });
  }

  it('preserves existing block comment spacing when disabled', () => {
    assert.equal(format('struct Example {\n/* Metadata */\n\n255: base.Base Base\n}',
      { separateBaseFields: false }),
    'struct Example {\n\n    /* Metadata */\n\n    255: required base.Base Base,\n}');
  });

  it('separates fields when comments are removed', () => {
    assert.equal(format('struct Example {\n1: string Name,\n// Metadata\n255: base.Base Base\n}',
      { separateBaseFields: true, keepComment: false }),
    'struct Example {\n    1: required string Name,\n\n    255: required base.Base Base,\n}');
  });

  it('supports formatting a single struct with PureThriftFormatter', () => {
    const data = ThriftData.fromString('struct Example {1: bool OK, 255: base.BaseResp BaseResp}');
    const fmt = new PureThriftFormatter();
    fmt.option(newOption({ separateBaseFields: true }));
    assert.equal(fmt.formatNode(data.document.getChild(0).getChild(0)),
      'struct Example {\n    1: bool OK,\n\n    255: base.BaseResp BaseResp\n}');
  });

  it('keeps service parameters inline', () => {
    assert.equal(format('service Example {void call(1: string Name, 2: base.Base Base)}'),
      'service Example {\n    void call(1: string Name, 2: base.Base Base),\n}');
  });
});
