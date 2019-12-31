// tslint:disable:no-any
import { fetch as crossFetch } from 'cross-fetch';
import { fold } from 'fp-ts/lib/Either';
import { flow, unsafeCoerce } from 'fp-ts/lib/function';
import { none, Option, some } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';
import { TaskEither, tryCatch } from 'fp-ts/lib/TaskEither';
import * as io from 'io-ts';

import { HandlerNotSetError, JsonDeserializationError } from './errors';

/**
 * Result of a fetch request – basically, a pair of code and payload
 */
export type Result<Code extends number, A> = { code: Code, payload: A };

type Handled<T, Code extends number> =
  T extends Result<infer C, infer D> ? C extends Code ? never : Result<C, D> : never;

type Data<T, Code extends number> = T extends Result<infer C, infer D> ? C extends Code ? D : never : never;

type Codes<T> = T extends Result<infer C, any> ? C : never;

type HandlersMap<TResult, To> = Map<
  Codes<TResult>,
  [(data: Data<TResult, Codes<TResult>>) => To, io.Type<Data<TResult, Codes<TResult>>> | undefined]
>;

/**
 * Fetch type – just for convenience
 */
export type Fetch = typeof fetch;

/**
 * Ftcher – a thin type-safe wrapper around @global fetch API
 *
 * @export
 * @class Fetcher
 * @template TResult Sum type of a @see Result records
 * @template To Target type the fetched result will be transformed into
 *
 * @example
 *
 */
export class Fetcher<TResult extends Result<any, any>, To> {
  private readonly handlers: HandlersMap<TResult, To> = new Map();
  private restHandler?: () => To = void 0;

  /**
   * Create a new instance of a Fetcher class
   * @param {RequestInfo} input Fetch input – either a string or a @see Request instance
   * @param {RequestInit} [init] Fetch initialization parameters
   * @param {Fetch} [fetch=crossFetch] (optional) Fetch function override – useful for testing
   * @memberof Fetcher
   */
  constructor(
    private readonly input: RequestInfo,
    private readonly init?: RequestInit,
    private readonly fetch: Fetch = crossFetch,
  ) { }

  /**
   * Transform `Fetcher<T, A>` into `Fetcher<T, B>`.
   * A functor method.
   *
   * @template B Type of the transformation result
   * @param {(a: To) => B} f Transformation function. Will be applied to all registered handlers.
   * @returns {Fetcher<TResult, B>} Transformed result
   * @memberof Fetcher
   */
  map<B>(f: (a: To) => B): Fetcher<TResult, B> {
    for (const [code, [handler, codec]] of this.handlers) {
      this.handlers.set(code, unsafeCoerce([flow(handler, f), codec]));
    }

    return unsafeCoerce(this);
  }

  /**
   * Register a handler for given code
   *
   * @template Code Type-level HTTP code literal – optional, inferrable
   * @param {Code} code HTTP code. Must be present in `TResult` sum type parameter of @see Fetcher
   * @param {(data: Data<TResult, Code>) => To} handler Handler for the given code
   * @param {io.Type<Data<TResult, Code>>} [codec] Optional codec for `To` type, used for validation
   * @returns {Fetcher<Handled<TResult, Code>, To>} A fetcher will `code` being handled
   * (so it's not possible to register another handler for it)
   * @memberof Fetcher
   */
  handle<Code extends Codes<TResult>>(
    code: Code,
    handler: (data: Data<TResult, Code>) => To,
    codec?: io.Type<Data<TResult, Code>>,
  ): Fetcher<Handled<TResult, Code>, To> {
    this.handlers.set(code, [handler, codec]);

    return unsafeCoerce(this);
  }

  /**
   * Handle all not handled explicitly response statuses using a provided fallback thunk
   *
   * @param {() => To} restHandler Thunk of a `To` type. Will be called if no suitable handles are found
   * for the response status code
   * @returns {Fetcher<Handled<TResult, never>, To>} Fetcher with ALL status codes being handled.
   * Note that you won't be able to add any additional handlers to the chain after a call to this method!
   * @memberof Fetcher
   */
  discardRest(restHandler: () => To): Fetcher<Handled<TResult, never>, To> {
    this.restHandler = restHandler;

    return unsafeCoerce(this);
  }

  /**
   * Convert a `Fetcher<T, A>` into a `TaskEither<Error, [A, Option<Errors>]>`.
   *
   * @returns {TaskEither<Error, [To, Option<io.Errors>]>} A `TaskEither` representing this `Fetcher`
   * @memberof Fetcher
   */
  toTaskEither(): TaskEither<Error, [To, Option<io.Errors>]> {
    return tryCatch(
      () => this.run(),
      (reason) => reason instanceof Error ? reason : new Error(`Something went wrong, details: ${reason}`),
    );
  }

  /**
   * Actually performs @external fetch request and executes and suitable handlers.
   *
   * @returns {Promise<[To, Option<io.Errors>]>} A promise of a pair of result and possible validation errors
   * @memberof Fetcher
   */
  async run(): Promise<[To, Option<io.Errors>]> {
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
