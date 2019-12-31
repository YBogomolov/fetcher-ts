// tslint:disable:no-any
import { fetch as crossFetch } from 'cross-fetch';
import * as E from 'fp-ts/lib/Either';
import { flow, unsafeCoerce } from 'fp-ts/lib/function';
import { pipe } from 'fp-ts/lib/pipeable';
import * as io from 'io-ts';

export type Result<Code extends number, A> = { code: Code, payload: A };

export type Handled<T, Code extends number> =
  T extends infer R ? R extends Result<any, any> ? R['code'] extends Code ? never : R : never : never;

export type Data<T, Code extends number> =
  T extends infer R ? R extends Result<any, any> ? R['code'] extends Code ? R['payload'] : never : never : never;

export type Codes<T> =
  T extends infer R ? R extends Result<any, any> ? R['code'] : never : never;

export type HandlersMap<TResult, To> = Map<
  Codes<TResult>,
  [(data: Data<TResult, Codes<TResult>>) => To, io.Type<Data<TResult, Codes<TResult>>> | undefined]
>;

export type Fetch = typeof fetch;

export class Fetcher<TResult extends Result<any, any>, To> {
  private readonly handlers: HandlersMap<TResult, To> = new Map();
  private restHandler?: () => To = void 0;

  constructor(
    private readonly input: RequestInfo,
    private readonly init?: RequestInit,
    private readonly fetch: Fetch = crossFetch,
  ) { }

  map<B>(f: (a: To) => B): Fetcher<TResult, B> {
    for (const [code, [handler, codec]] of this.handlers) {
      this.handlers.set(code, unsafeCoerce([flow(handler, f), codec]));
    }

    return unsafeCoerce(this);
  }

  handle<Code extends Codes<TResult>>(
    code: Code,
    handler: (data: Data<TResult, Code>) => To,
    codec?: io.Type<Data<TResult, Code>>,
  ): Fetcher<Handled<TResult, Code>, To> {
    this.handlers.set(code, [handler, codec]);

    return unsafeCoerce(this);
  }

  discardRest(discardWith: () => To): Fetcher<Handled<TResult, never>, To> {
    this.restHandler = discardWith;

    return unsafeCoerce(this);
  }

  async run(): Promise<[To, io.Errors | undefined]> {
    const response = await this.fetch(this.input, this.init);

    const status = response.status as Codes<TResult>;
    const pair = this.handlers.get(status);

    if (pair != null) {
      const [handler, codec] = pair;

      const body = await response.json();
      const to = handler(body);

      if (codec) {
        return pipe(
          codec.decode(to),
          E.fold(
            (errors): [To, io.Errors | undefined] => [to, errors],
            (res) => [res, void 0],
          ),
        );
      }

      return [to, void 0];
    }

    if (this.restHandler != null) {
      return [this.restHandler(), void 0];
    }

    throw new Error(`Neither handler for ${status} nor rest handler are set - consider adding \`.handle(${status}, ...)\` or \`.discardRest(() => ...)\` calls to the chain`);
  }
}
