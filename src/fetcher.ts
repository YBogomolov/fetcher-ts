// tslint:disable:no-any
import { fetch as crossFetch } from 'cross-fetch';
import { fold } from 'fp-ts/lib/Either';
import { flow, unsafeCoerce } from 'fp-ts/lib/function';
import { none, Option, some } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';
import { TaskEither, tryCatch } from 'fp-ts/lib/TaskEither';
import * as io from 'io-ts';

import { HandlerNotSetError, JsonDeserializationError } from './errors';

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

  discardRest(restHandler: () => To): Fetcher<Handled<TResult, never>, To> {
    this.restHandler = restHandler;

    return unsafeCoerce(this);
  }

  run(): TaskEither<Error, [To, Option<io.Errors>]> {
    return tryCatch(
      () => this.runUnsafe(),
      (reason) => reason instanceof Error ? reason : new Error(`Something went wrong, details: ${reason}`),
    );
  }

  async runUnsafe(): Promise<[To, Option<io.Errors>]> {
    try {
      const response = await this.fetch(this.input, this.init);

      const status = response.status as Codes<TResult>;
      const pair = this.handlers.get(status);

      if (pair != null) {
        const [handler, codec] = pair;

        try {
          const body = await response.json();

          try {
            const to = handler(body);

            if (codec) {
              return pipe(
                codec.decode(to),
                fold(
                  (errors) => [to, some(errors)],
                  (res) => [res, none],
                ),
              );
            }

            return [to, none];
          } catch (error) {
            return Promise.reject(new Error(`Handler side error, details: ${error}`));
          }
        } catch (jsonError) {
          return Promise.reject(
            new JsonDeserializationError(`Could not deserialize response JSON, details: ${jsonError}`),
          );
        }
      }

      if (this.restHandler != null) {
        return [this.restHandler(), none];
      }

      return Promise.reject(
        new HandlerNotSetError(`Neither handler for ${status} nor rest handler are set - consider adding \`.handle(${status}, ...)\` or \`.discardRest(() => ...)\` calls to the chain`),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
