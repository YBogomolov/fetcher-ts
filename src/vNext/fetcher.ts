import { Either } from 'fp-ts/lib/Either';
import { ReaderEither } from 'fp-ts/lib/ReaderEither';
import { ReaderTaskEither } from 'fp-ts/lib/ReaderTaskEither';

import { Kleisli } from './kleisli';

export type Fetch = typeof fetch;

export type Extractor<A> = Kleisli<'Promise', Response, A>;
export type Decoder<E, A> = ReaderEither<unknown, E, A>;
export type Processor<E, A> = ReaderEither<Response, E, A>;

export type Status =
  | 100 | 101 | 102
  | 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226
  | 300 | 301 | 302 | 302 | 303 | 304 | 305 | 306 | 307 | 308
  // tslint:disable-next-line:max-line-length
  | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 419 | 421 | 422 | 423 | 424 | 426 | 428 | 429 | 431 | 449 | 451 | 499
  | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 509 | 510 | 511 | 520 | 521 | 522 | 523 | 524 | 525 | 526;

export type FetcherError =
  | { readonly type: 'JsonDeserializationError'; readonly details: unknown }
  | { readonly type: 'HandlerNotSetError'; readonly status: number };

export interface Fetcher<S extends Status, E, A> {
  readonly input: RequestInfo;
  readonly handlers: Record<S, Decoder<E, A>>;
  readonly onUnexpectedError: (error: FetcherError) => Either<E, A>;
  readonly init?: RequestInit;
}

export function make<S extends Status, E, A>(
  input: RequestInfo,
  handlers: Record<S, Decoder<E, A>>,
  onUnexpectedError: (error: FetcherError) => Either<E, A>,
  init?: RequestInit,
): Fetcher<S, E, A> {
  return { input, handlers, onUnexpectedError, init };
}

export const stringExtractor: Extractor<string> = (response) => response.text();
export const jsonExtractor: Extractor<unknown> = (response) => response.json();

export function toTaskEither<S extends Status, E, A>({
  input,
  handlers,
  onUnexpectedError,
  init,
}: Fetcher<S, E, A>): ReaderTaskEither<Fetch, E, A> {
  return (fetch) => async () => {
    const isStatus = (s: number): s is S => handlers.hasOwnProperty(s);

    const response = await fetch(input, init);
    const status = response.status;

    if (isStatus(status)) {
      try {
        const contentType = response.headers.get('content-type');
        const body: unknown = contentType?.includes('application/json') !== undefined ?
          await response.json() :
          await response.text();
        const handler = handlers[status];

        return handler(body);
      } catch (details) {
        return onUnexpectedError({ type: 'JsonDeserializationError', details });
      }
    } else {
      return onUnexpectedError({ type: 'HandlerNotSetError', status });
    }
  };
}
