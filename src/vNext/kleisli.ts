import { Kind, URIS } from 'fp-ts/lib/HKT';

declare module 'fp-ts/lib/HKT' {
  interface URItoKind<A> {
    Promise: Promise<A>;
  }
}

export type Kleisli<F extends URIS, A, B> = (a: A) => Kind<F, B>;

export type Cokleisli<G extends URIS, A, B> = (ga: Kind<G, A>) => B;
