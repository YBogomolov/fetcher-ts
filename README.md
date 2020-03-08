# Type-Safe Fetcher

[![npm](https://img.shields.io/npm/v/fetcher-ts.svg)](https://www.npmjs.com/package/fetcher-ts)
[![Build Status](https://travis-ci.org/YBogomolov/fetcher-ts.svg)](https://travis-ci.org/YBogomolov/fetcher-ts)

## Motivation
Aim of this project is to provide a thin type-safe wrapper around [fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), useful for working with JSON REST APIs.

## Installation

```sh
npm install --save fetcher-ts
```

As this project is a part of `fp-ts` ecosystem, you'll also need `fp-ts` and `io-ts` as a peer dependencies. And don't forget to install a [cross-fetch](https://github.com/lquixada/cross-fetch) as a peer dependency as well – it provides an isomorphic implementation of `fetch` using `whatwg-fetch` and `node-fetch`:

```sh
npm install --save fp-ts io-ts cross-fetch
```

## Usage example

Let's dive into an example right away!

```ts
// This is main business model – basically, any interface serializable to JSON you can imagine
type User = { name: string };
// And this is a model for HTTP 422 response code – it contains some internal code plus correlation ID from logging system
type FourTwoTwo = { code: number; correlationId: string };

// Type of possible server responses. It should extend `Result<Code, T>` from `fetcher`:
type GetUserResult =
  | { code: 200, payload: User[] } // 200 OK – we got the result
  | { code: 400, payload: Error } // 400 Bad Request – we did something wrong
  | { code: 401, payload: [Error, string] } // 401 Unauthorized – we tried requesting a resource we don't have access to
  | { code: 422, payload: FourTwoTwo }; // 422 Unprocessable entity – business logic error from some internal system

// `io-ts` validators for 200 and 422 responses.
// Please note that they are optional – if they are not passed to `.handle()`, the validation stage will be skipped.
const TUsers = io.array(io.type({ name: io.string }));
const TFourTwoTwo = io.type({ code: io.number, correlationId: io.string });

const [n, errors] = 
  // We create an instance of `Fetcher` class and parameterize it with our response type and final transformation result we want:
  await new Fetcher<GetUserResult, string>('https://example.com')
    // In 200 handler we need to pass a function from `User[]` to `string`, as specified in `Fetcher` parameters:
    .handle(200, (users) => users.map((u) => u.name).join(', '), TUsers)
    // In 400 handler we need to handle plain `Error`:
    .handle(400, (err) => err.message)
    // In 422 we need to deal with internal error code and correlation ID:
    .handle(
      422,
      ({ correlationId }) => correlationId,
      TFourTwoTwo,
      // For the sake of brewity I use non-null assertion here; in real code you should check for presence:
      async (res) => ({ code: +res.headers.get('x-code')!, correlationId: res.headers.get('x-correlation-id')! }),
    )
    // In 401 handler we get as a response name of permission we lack:
    .handle(401, ([err, permission]) => `You lack ${permission}. Also, ${err.message}`)
    // We CANNOT specify explicit handlers for codes we didn't describe in the `GetUserResult` type:
    // .handle(500, () => `Argument of type '500' is not assignable to parameter of type 'never'`)
    // However, we can use `discardRest` to specify a "fallback" thunk which will be executed for any codes which are not explicitly handled:
    .discardRest(() => '42')
    // `Fetcher<T, A>` is a functor in `A`, i.e. could be transformed into `Fetcher<T, B>`:
    .map((s) => s.length)
    // Finally, we can use `run` to get a `Promise<[Result, Option<io.Errors>]>`:
    .run();

// Here `n` will be a `number`, and `errors` will either be undefined, or an instance of `io.Errors`:
console.log(n, errors);
```

## Public API

```ts
import { Fetcher } from 'fetcher-ts';
```

A `Fetcher` class is a wrapper around `window.fetch` with additional type safety. Its public API consists of:

### Type parameters: `TResult` and `To`

#### `TResult`

Sum type of possible API endpoint responses. Should consist of a `{ code: number, payload: T }` entries:

```ts
type MyMethodResults = 
  | { code: 200, payload: string[] } 
  | { code: 500, payload: Error };
```

#### `To`

A type into which the response will be transformed. Could easily be the same type as in `200` response – given that you can construct a fallback instance for all other reponse codes.

### constructor(input: RequestInfo, init?: RequestInit)

Creates a new instance of a `Fetcher` class. Parameters are exactly the same you would normally use for `window.fetch`.

Please note that you'll need to pass type parameters to the constructor as well in order to ensure type inference works correctly:

```ts
type MyMethodResults = 
  | { code: 200, payload: string[] } 
  | { code: 500, payload: Error };
const fetcher = new Fetcher<MyMethodResults, string>('https://example.com');
```

#### .handle(code: number, handler: (data: From) => To, codec?: io.Type<From>, extractor: (response: Response) => Promise<From>): Fetcher<...>

Register a handler for given `code`, using optional `extractor` to conver the raw `Response` into target type `From`. Please note that `code` should be present in the passed to the constructor type parameter:

```ts
type MyMethodResults = 
  | { code: 200, payload: string[] } 
  | { code: 500, payload: Error };
const fetcher = new Fetcher<MyMethodResults, string>('https://example.com')
  .handle(400, () => 'no way'); // compilation error: Argument of type '400' is not assignable to parameter of type 'never'
```

Also an [io-ts](https://gcanti.github.io/io-ts/) codec could be passed for each handler, providing validation capability for each handler:

```ts
type MyOtherMethod = { code: 400, payload: string }; // this enpoint can only fail with a text of an error :(
const [result, errors] = await new Fetcher<MyOtherMethod, string>('https://example.com/other')
  .handle(400, (msg) => `Oh noes, error: ${msg}`, io.string)
  .run();
// If the server responds not with string, an `io-ts` validation error will be present in `errors` (`Some<Errors>`).
```

#### .discardRest(restHandler: () => To): Fetcher<...>

Register a fallback handler for all HTTP status codes not registered explicitly using `.handle()`:

```ts
type MyMethodResults = 
  | { code: 200, payload: string[] } 
  | { code: 500, payload: Error };
const fetcher = new Fetcher<MyMethodResults, string>('https://example.com')
  .handle(200, (strings) => string.join(', '))
  .discardRest(() => 'no way'); // code 500 and any other will be handled by this thunk
```

#### run(): Promise<[To, Option<io.Errors>]>

The main method to actually consume the built fetch handling chain and execute the request:

```ts
type MyMethodResults = 
  | { code: 200, payload: string[] } 
  | { code: 500, payload: Error };
const [result, validationErrors] = await new Fetcher<MyMethodResults, string>('https://example.com')
  .handle(200, (strings) => string.join(', '))
  .discardRest(() => 'no way')
  .run(); // => result: string, validationErrors: Option<io.Errors>
```

#### toTaskEither(): TaskEither<Error, [To, Option<io.Errors>]>

A convenience method to transform built fetcher chain into a [TaskEither](https://gcanti.github.io/fp-ts/modules/TaskEither.ts.html).

### Use cases for this project

Such fetcher design will be beneficial for autogenerated APIs – i.e. if your result sum type is generated from something akin to OpenAPI specification. In this case the developer who uses `fetcher` with such sum type will always be sure that he/she handled all possible codes, as the type system will serve as a guide.
