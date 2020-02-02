import { flow, identity } from 'fp-ts/lib/function';
import { pipe } from 'fp-ts/lib/pipeable';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import * as R from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';

/**
 * Main method of Fetch API:
 * (input: RequestInfo, init?: RequestInit) => Promise<Response>
 */
export type Fetch = typeof fetch;

/**
 * Decoder – an async function which takes a Response and either fails with `E` or succeeds with `A`.
 */
export type Decoder<E, A> = RTE.ReaderTaskEither<Response, E, A>;

/**
 * A map of decoders per each HTTP status code specified in `S`.
 * Status for list of supported HTTP codes.
 */
export type Handlers<S extends Status, E, A> = Record<S, Decoder<E, A>>;

/**
 * HTTP status code according to IANA registry.
 * See @external https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml for full list
 */
export type Status =
  | 100 | 101 | 102 | 103
  | 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226
  | 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308
  | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 419
  | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451
  | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 509 | 510 | 511 | 520 | 521 | 522 | 523 | 524 | 525 | 526;

/**
 * Fetcher – a value representing data sufficient to make a fetch request.
 * Does not represent an actual request/response – it's just a value which needs to be interpreted somehow.
 * toTaskEither for an example of such interpretation
 *
 * @export
 * @interface Fetcher
 * @template S A sum type of Status codes.
 * @template E Error type – usually `Error`.
 * @template A Result type – usually some kind of business object.
 */
export interface Fetcher<S extends Status, E, A> {
  /**
   * Fetch API request input: either a URL string, or a @external Request object.
   *
   * @type {RequestInfo}
   * @memberof Fetcher
   */
  readonly input: RequestInfo;

  /**
   * A mapping of HTTP status code (representing server response) to a handler for that code.
   *
   * @type {Handlers<S, E, A>}
   * @memberof Fetcher
   */
  readonly handlers: Handlers<S, E, A>;

  /**
   * Hander for unexpected error – i.e. the one not present in @template S type.
   *
   * @type {Decoder<E, A>}
   * @memberof Fetcher
   */
  readonly onUnexpectedError: Decoder<E, A>;

  /**
   * Request init object – can contain headers, mode, etc.
   * See @external RequestInit for the details.
   *
   * @type {RequestInit}
   * @memberof Fetcher
   */
  readonly init?: RequestInit;
}

/**
 * Construct a new Fetcher structure.
 *
 * @export
 * @template S Sum type of HTTP codes the server might respond with.
 * @template E Error type
 * @template A Result type
 * @param {RequestInfo} input Fetch API input parameter – URL string or @external Request object
 * @param {Handlers<S, E, A>} handlers A mapping of HTTP code to a handler method
 * @param {Decoder<E, A>} onUnexpectedError Handler for status codes not present in S type
 * @param {RequestInit} [init] (optional) Fetch API init parameter – headers, mode, etc.
 * @returns {Fetcher<S, E, A>} A Fetcher structure
 */
export function make<S extends Status, E, A>(
  input: RequestInfo,
  handlers: Handlers<S, E, A>,
  onUnexpectedError: Decoder<E, A>,
  init?: RequestInit,
): Fetcher<S, E, A> {
  return { input, handlers, onUnexpectedError, init };
}

/**
 * Transform both error and result types simultaneously.
 * A Bifunctor method.
 *
 * @export
 * @template S Sum type of HTTP status codes
 * @template E Existing error type
 * @template A Existing result type
 * @template G New error type
 * @template B New result type
 * @param {(e: E) => G} f Function to transform old error to a new error
 * @param {(a: A) => B} g Function to transform old result to a new result
 * @returns {(fetcher: Fetcher<S, E, A>) => Fetcher<S, G, B>} A new Fetcher structure
 */
export function bimap<S extends Status, E, A, G, B>(
  f: (e: E) => G,
  g: (a: A) => B,
): (fetcher: Fetcher<S, E, A>) => Fetcher<S, G, B> {
  return (fetcher: Fetcher<S, E, A>) => ({
    input: fetcher.input,
    handlers: pipe(fetcher.handlers, R.map(RTE.bimap(f, g))) as Record<S, Decoder<G, B>>,
    onUnexpectedError: pipe(fetcher.onUnexpectedError, RTE.bimap(f, g)),
    init: fetcher.init,
  });
}

/**
 * Transform result type, leaving error type intact.
 * A Functor method.
 *
 * @export
 * @template S Sum type of HTTP status codes.
 * @template E Error type
 * @template A Existing result type
 * @template B New result type
 * @param {(a: A) => B} f Function to transform old result to a new result
 * @returns {(fetcher: Fetcher<S, E, A>) => Fetcher<S, E, B>} A new Fetcher structure
 */
export function map<S extends Status, E, A, B>(f: (a: A) => B): (fetcher: Fetcher<S, E, A>) => Fetcher<S, E, B> {
  return bimap(identity, f);
}

/**
 * Transform error type, leaving result type intact.
 * A Bifunctor method.
 *
 * @export
 * @template S Sum type of HTTP status codes.
 * @template E Existing error type
 * @template A Result type
 * @template G New error type
 * @param {(e: E) => G} g Function to transform old error to a new error
 * @returns {(fetcher: Fetcher<S, E, A>) => Fetcher<S, G, A>} A new Fetcher structure
 */
export function mapLeft<S extends Status, E, A, G>(g: (e: E) => G): (fetcher: Fetcher<S, E, A>) => Fetcher<S, G, A> {
  return bimap(g, identity);
}

/**
 * Provide new set of handlers for unhandled HTTP codes, extending the previous fetcher.
 *
 * @export
 * @template OldS Old HTTP status sum type
 * @template NewS New HTTP status sum type – cannot have overlapping entries with OldS
 * @template E Error type
 * @template A Result type
 * @param {Handlers<NewS, E, A>} handlers A mapping of NewS HTTP status code to handlers
 * @returns {((fetcher: Fetcher<OldS, E, A>) => Fetcher<OldS | NewS, E, A>)} A function to map old
 * Fetcher structure to a new one with `OldS | NewS` statuses handled.
 */
export function extend<OldS extends Status, NewS extends Exclude<Status, OldS>, E, A>(
  handlers: Handlers<NewS, E, A>,
): (fetcher: Fetcher<OldS, E, A>) => Fetcher<OldS | NewS, E, A> {
  return (fetcher) => ({
    ...fetcher,
    handlers: { ...fetcher.handlers, ...handlers },
  });
}

/**
 * A convenience method – extend the existing fetcher and refine its result type at the same time.
 * extend for reference.
 * @param ab Function to transform the result type from `A` to `B`
 */
export const extendWith = <A, B extends A>(ab: (a: A) => B) =>
  <OldS extends Status, NewS extends Exclude<Status, OldS>, E>(
    handlers: Handlers<NewS, E, B>,
  ): (fetcher: Fetcher<OldS, E, A>) => Fetcher<OldS | NewS, E, B> => flow(map(ab), extend(handlers));

/**
 * A simple generic handler for unknown error.
 *
 * @export
 * @param e Error (anything)
 */
export const handleError = (e: unknown) => (e instanceof Error ? e : new Error('unknown error'));

/**
 * A decoder which extracts response body as string.
 *
 * @export
 * @param response Server @external Response to parse
 */
export const stringDecoder: Decoder<Error, string> = (response) => TE.tryCatch(() => response.text(), handleError);

/**
 * A decoder which extracts response body as JSON.
 *
 * @export
 * @param response Server @external Response to parse
 */
export const jsonDecoder: Decoder<Error, unknown> = (response) => TE.tryCatch(() => response.json(), handleError);

/**
 * Interpret Fetcher structure into a @external TaskEither value.
 *
 * @export
 * @template S Sum type of HTTP codes the server might respond with.
 * @template E Error type
 * @template A Result type
 * @param {Fetch} fetch Actual @external Fetch API implementation.
 * @param {Fetcher<S, E, A>} Fetcher structure which needs to be interpreted.
 * @returns {<S extends Status, E, A>(fetcher: Fetcher<S, E, A>) => TE.TaskEither<E, A>} Task which could fail with
 * error of type `E` or succeed with `A`.
 */
export function toTaskEither(fetch: Fetch): <S extends Status, E, A>(fetcher: Fetcher<S, E, A>) => TE.TaskEither<E, A> {
  return <S extends Status, E, A>(fetcher: Fetcher<S, E, A>) => {
    const isHandled = (s: number): s is S => fetcher.handlers.hasOwnProperty(s);

    return pipe(
      TE.rightTask(() => fetch(fetcher.input, fetcher.init)),
      TE.chain(
        (response) => {
          const status = response.status;
          const method = isHandled(status) ? fetcher.handlers[status] : fetcher.onUnexpectedError;

          return method(response);
        },
      ),
    );
  };
}
