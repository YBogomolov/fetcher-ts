import * as E from 'fp-ts/lib/Either';
import { flow } from 'fp-ts/lib/function';
import * as t from 'io-ts';
import { failure } from 'io-ts/lib/PathReporter';

import { Fetcher, make } from './fetcher';

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

const fetcher1: Fetcher<GetUserResult['code'], string, GetUserResult> = make(
  'myurl',
  {},
  () => E.left<string, GetUserResult>('unexpected error'),
);

const decodeError = (errors: t.Errors): string => failure(errors).join('\n');

const handleUsers = flow(
  Users.decode,
  E.bimap(decodeError, (payload) => ({ code: 200 as const, payload })),
);

const handleFourTwoTwo = flow(
  FourTwoTwo.decode,
  E.bimap(decodeError, (payload) => ({ code: 422 as const, payload })),
);

// partial coverage, fetcher2 is inferred as: Fetcher<200 | 422, string, GetUserResult>
const fetcher2 = make(
  'myurl',
  {
    200: handleUsers,
    422: handleFourTwoTwo,
  },
  () => E.left<string, GetUserResult>('unexpected error'),
);

// you could also specify which statuses should be handled explicitly using
// a type annotation
const fetcher3 = make<200 | 422 | 400, string, GetUserResult>('myurl')({
  fetch,
  handlers: {
    200: handleUsers,
    422: handleFourTwoTwo,
    onUnexpectedError: () => E.left('unexpected error'),
  },
});
// ^--- error: Property '400' is missing in type ...
