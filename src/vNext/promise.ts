// tslint:disable:max-line-length
// tslint:disable:ban-types

declare module 'fp-ts/lib/HKT' {
  interface URItoKind<A> {
    Promise: Promise<A>;
  }
}

type FnP<A, B> = (a: A) => Promise<B>;

export function flowP<A extends unknown[], B>(ab: (...a: A) => Promise<B>): (...a: A) => Promise<B>;
export function flowP<A extends unknown[], B, C>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>): FnP<A, C>;
export function flowP<A extends unknown[], B, C, D>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>, cd: FnP<C, D>): FnP<A, D>;
export function flowP<A extends unknown[], B, C, D, E>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>, cd: FnP<C, D>, de: FnP<D, E>): FnP<A, E>;
export function flowP<A extends unknown[], B, C, D, E, F>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>, cd: FnP<C, D>, de: FnP<D, E>, ef: FnP<E, F>): FnP<A, F>;
export function flowP<A extends unknown[], B, C, D, E, F, G>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>, cd: FnP<C, D>, de: FnP<D, E>, ef: FnP<E, F>, fg: FnP<F, G>): FnP<A, G>;
export function flowP<A extends unknown[], B, C, D, E, F, G, H>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>, cd: FnP<C, D>, de: FnP<D, E>, ef: FnP<E, F>, fg: FnP<F, G>, gh: FnP<G, H>): FnP<A, H>;
export function flowP<A extends unknown[], B, C, D, E, F, G, H, I>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>, cd: FnP<C, D>, de: FnP<D, E>, ef: FnP<E, F>, fg: FnP<F, G>, gh: FnP<G, H>, hi: FnP<H, I>): FnP<A, I>;
export function flowP<A extends unknown[], B, C, D, E, F, G, H, I, J>(ab: (...a: A) => Promise<B>, bc: FnP<B, C>, cd: FnP<C, D>, de: FnP<D, E>, ef: FnP<E, F>, fg: FnP<F, G>, gh: FnP<G, H>, hi: FnP<H, I>, ij: FnP<I, J>): FnP<A, J>;
export function flowP(
  ab: Function,
  bc?: Function,
  cd?: Function,
  de?: Function,
  ef?: Function,
  fg?: Function,
  gh?: Function,
  hi?: Function,
  ij?: Function,
): unknown {
  switch (arguments.length) {
    case 1:
      return ab;
    case 2:
      return async function(this: unknown) {
        return bc!(await ab.apply(this, arguments));
      };
    case 3:
      return async function(this: unknown) {
        return cd!(await bc!(await ab.apply(this, arguments)));
      };
    case 4:
      return async function(this: unknown) {
        return de!(await cd!(await bc!(await ab.apply(this, arguments))));
      };
    case 5:
      return async function(this: unknown) {
        return ef!(await de!(await cd!(await bc!(await ab.apply(this, arguments)))));
      };
    case 6:
      return async function(this: unknown) {
        return fg!(await ef!(await de!(await cd!(await bc!(await ab.apply(this, arguments))))));
      };
    case 7:
      return async function(this: unknown) {
        return gh!(await fg!(await ef!(await de!(await cd!(await bc!(await ab.apply(this, arguments)))))));
      };
    case 8:
      return async function(this: unknown) {
        return hi!(await gh!(await fg!(await ef!(await de!(await cd!(await bc!(await ab.apply(this, arguments))))))));
      };
    case 9:
      return async function(this: unknown) {
        return ij!(await hi!(await gh!(await fg!(await ef!(await de!(await cd!(await bc!(await ab.apply(this, arguments)))))))));
      };
  }
}
