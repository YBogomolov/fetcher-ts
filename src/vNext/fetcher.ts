import { flow, identity } from 'fp-ts/lib/function';
import { pipe } from 'fp-ts/lib/pipeable';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';
import * as R from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';

export type Fetch = typeof fetch;

export type Decoder<E, A> = RTE.ReaderTaskEither<Response, E, A>;

export type Handlers<S extends Status, E, A> = Record<S, Decoder<E, A>>;

export type Status =
  | 100 | 101 | 102
  | 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226
  | 300 | 301 | 302 | 302 | 303 | 304 | 305 | 306 | 307 | 308
  | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418
  | 419 | 421 | 422 | 423 | 424 | 426 | 428 | 429 | 431 | 449 | 451 | 499
  | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 509 | 510 | 511 | 520 | 521 | 522 | 523 | 524 | 525 | 526;

export interface Fetcher<S extends Status, E, A> {
  readonly input: RequestInfo;
  readonly handlers: Handlers<S, E, A>;
  readonly onUnexpectedError: Decoder<E, A>;
  readonly init?: RequestInit;
}

export function make<S extends Status, E, A>(
  input: RequestInfo,
  handlers: Handlers<S, E, A>,
  onUnexpectedError: Decoder<E, A>,
  init?: RequestInit,
): Fetcher<S, E, A> {
  return { input, handlers, onUnexpectedError, init };
}

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

export function map<S extends Status, E, A, B>(f: (a: A) => B): (fetcher: Fetcher<S, E, A>) => Fetcher<S, E, B> {
  return bimap(identity, f);
}

export function mapLeft<S extends Status, E, A, G>(g: (e: E) => G): (fetcher: Fetcher<S, E, A>) => Fetcher<S, G, A> {
  return bimap(g, identity);
}

export function extend<OldS extends Status, NewS extends Exclude<Status, OldS>, E, A>(
  handlers: Handlers<NewS, E, A>,
): (fetcher: Fetcher<OldS, E, A>) => Fetcher<OldS | NewS, E, A> {
  return (fetcher) => ({
    ...fetcher,
    handlers: { ...fetcher.handlers, ...handlers },
  });
}

export const extendWith = <A, B extends A>(ab: (a: A) => B) =>
  <OldS extends Status, NewS extends Exclude<Status, OldS>, E>(
    handlers: Handlers<NewS, E, B>,
  ): (fetcher: Fetcher<OldS, E, A>) => Fetcher<OldS | NewS, E, B> => flow(map(ab), extend(handlers));

export const handleError = (e: unknown) => (e instanceof Error ? e : new Error('unknown error'));

export const stringDecoder: Decoder<Error, string> = (response) => TE.tryCatch(() => response.text(), handleError);

export const jsonDecoder: Decoder<Error, unknown> = (response) => TE.tryCatch(() => response.json(), handleError);

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
