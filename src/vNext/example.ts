import * as E from 'fp-ts/lib/Either';
import { flow } from 'fp-ts/lib/function';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';
import * as t from 'io-ts';
import { failure } from 'io-ts/lib/PathReporter';

import { Decoder, extend, Fetcher, handleError, jsonDecoder, make } from './fetcher';

const User = t.type({ name: t.string });
const Users = t.array(User);
const FourTwoTwo = t.type({ code: t.number, correlationId: t.string });

interface User extends t.TypeOf<typeof User> { }
interface FourTwoTwo extends t.TypeOf<typeof FourTwoTwo> { }

type GetUserResult =
  | { code: 200; payload: User[] }
  | { code: 400; payload: Error }
  | { code: 401; payload: [Error, string] }
  | { code: 422; payload: FourTwoTwo };

// helpers:

const decodeError = (errors: t.Errors): Error => new Error(failure(errors).join('\n'));

const handleUsers = (res: Response) => pipe(
  jsonDecoder(res),
  TE.chain(
    flow(
      Users.decode,
      E.bimap(decodeError, (payload) => ({ code: 200 as const, payload })),
      TE.fromEither,
    ),
  ),
);

const headersDecoder: Decoder<Error, FourTwoTwo> =
  (response) => TE.tryCatch(async () => ({
    code: +response.headers.get('X-CODE')!,
    correlationId: response.headers.get('X-CORRELATIONID')!,
  }), handleError);

const handleFourTwoTwo = (res: Response) => pipe(
  headersDecoder(res),
  TE.chain(
    flow(
      FourTwoTwo.decode,
      E.bimap(decodeError, (payload) => ({ code: 422 as const, payload })),
      TE.fromEither,
    ),
  ),
);

// examples:

const fetcher1: Fetcher<GetUserResult['code'], string, GetUserResult> = make(
  'myurl',
  {},
  () => TE.left<Error, GetUserResult>(new Error('unexpected error')),
);
// => Type 'Record<never, Decoder<string, GetUserResult>>' is missing the following properties from type
// 'Record<200 | 400 | 401 | 422, Decoder<string, GetUserResult>>': 200, 400, 401, 422

// fetcher2: Fetcher<200 | 422, Error, GetUserResult>
const fetcher2 = make(
  'myurl',
  {
    200: handleUsers,
    422: handleFourTwoTwo,
  },
  () => TE.left<Error, GetUserResult>(new Error('unexpected error')),
);

// fetcher21: Fetcher<100 | 200 | 400 | 422, Error, GetUserResult>
const fetcher21 = extend(fetcher2, {
  400: () => TE.right<Error, GetUserResult>({ code: 400, payload: new Error('aaaaa') }),
  100: () => TE.left<Error, GetUserResult>(new Error('aaaaaaaa')),
});

const fetcher3 = make<200 | 422 | 400, Error, GetUserResult>(
  'myurl',
  {
    200: handleUsers,
    422: handleFourTwoTwo,
  }, // => Property '400' is missing in type ...
  () => E.left('unexpected error'),
);
