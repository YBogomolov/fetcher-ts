import { Response } from 'cross-fetch';
import { identity } from 'fp-ts/lib/function';
import * as O from 'fp-ts/lib/Option';
import * as io from 'io-ts';

import { Fetcher, textExtractor } from './fetcher';

describe('Fetcher suite', () => {
  it('should handle simple 200 response with text data', async () => {
    type TestMethod = { code: 200, payload: string };
    const fetchMock = jest.fn(
      async (_input: RequestInfo, _init?: RequestInit) => new Response('foo', { status: 200 }),
    );

    const [res, errs] = await new Fetcher<TestMethod, string>('', undefined, fetchMock)
      .handle(200, identity, io.string)
      .run();

    expect(res).toStrictEqual('foo');
    expect(O.isNone(errs)).toBeTruthy();
  });

  it('should handle simple 200 response with JSON data', async () => {
    type TestData = { foo: string, baz: number };
    const TTestData = io.type({ foo: io.string, baz: io.number });
    type TestMethod = { code: 200, payload: TestData };
    const TEST_DATA = { foo: 'bar', baz: 42 };
    const fetchMock = jest.fn(
      async (_input: RequestInfo, _init?: RequestInit) => new Response(
        JSON.stringify(TEST_DATA),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const [res, errs] = await new Fetcher<TestMethod, TestData>('', undefined, fetchMock)
      .handle(200, identity, TTestData)
      .run();

    expect(res).toStrictEqual(TEST_DATA);
    expect(O.isNone(errs)).toBeTruthy();
  });

  it('should handle simple 400 response', async () => {
    type TestMethod =
      | { code: 200, payload: number }
      | { code: 400, payload: string };

    const fetchMock = jest.fn(
      async (_input: RequestInfo, _init?: RequestInit) => new Response(
        'fooo',
        { status: 400 },
      ),
    );

    const [res, errs] = await new Fetcher<TestMethod, string>('', undefined, fetchMock)
      .handle(200, (n) => n.toString(), io.number)
      .handle(400, identity)
      .run();

    expect(res).toStrictEqual('fooo');
    expect(O.isNone(errs)).toBeTruthy();
  });

  it('should validate incorrectly shaped responses', async () => {
    type TestData = { foo: string, baz: number };
    const TTestData = io.type({ foo: io.string, baz: io.number });
    type TestMethod = { code: 200, payload: TestData };

    const fetchMock = jest.fn(
      async (_input: RequestInfo, _init?: RequestInit) => new Response(
        JSON.stringify({ foo: 'bar', baz: '42' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const [res, errs] = await new Fetcher<TestMethod, TestData>('', undefined, fetchMock)
      .handle(200, identity, TTestData)
      .run();

    switch (errs._tag) {
      case 'None': return fail('should be Some');
      case 'Some': return expect(errs.value.length).toEqual(1);
    }
  });

  it('should get data from headers via passed extractor', async () => {
    type TestMethod =
      | { code: 200, payload: number }
      | { code: 400, payload: string };

    const fetchMock = jest.fn(
      async (_input: RequestInfo, _init?: RequestInit) => new Response(
        null,
        { status: 400, headers: { 'x-payload': 'fooo' } },
      ),
    );

    const [res, errs] = await new Fetcher<TestMethod, string>('', undefined, fetchMock)
      .handle(200, (n) => n.toString(), io.number)
      .handle(400, identity, io.string, async (r) => r.headers.get('x-payload') || 'NOT FOUND')
      .run();

    expect(res).toStrictEqual('fooo');
    expect(O.isNone(errs)).toBeTruthy();
  });

  it('[#6] Map should preserve structure', async () => {
    type TestMethod = { code: 200, payload: string };

    const fetchMock = jest.fn(
      async (_input: RequestInfo, _init?: RequestInit) => new Response(
        '1234',
        { status: 200 },
      ),
    );
    const [res, errs] = await new Fetcher<TestMethod, string>('', undefined, fetchMock)
      .handle(200, identity, io.string)
      .map((s) => s.length)
      .run();

    expect(res).toStrictEqual(4);
    expect(O.isNone(errs)).toBeTruthy();
  });
});
