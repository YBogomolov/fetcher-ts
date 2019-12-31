import * as io from 'io-ts';

import { Fetcher } from '../src/fetcher';

// EXAMPLES
(async () => {

  type User = { name: string };
  type FourTwoTwo = { code: number; correlationId: string };

  type GetUserResult =
    | { code: 200, data: User[] }
    | { code: 400, data: Error }
    | { code: 401, data: [Error, string] }
    | { code: 422, data: FourTwoTwo };

  const TUser = io.array(io.type({ name: io.string }));

  const [s, errors] = await new Fetcher<GetUserResult, string>('https://g.com')
    .handle(200, (users) => users.map((u) => u.name).join(', '), TUser)
    .handle(400, (err) => err.message)
    .handle(422, ({ correlationId }) => correlationId)
    .handle(401, ([_err, permission]) => 'You lack ' + permission)
    // .handle(500, () => `Argument of type '500' is not assignable to parameter of type 'never'`)
    .discardRest(() => '42')
    .run();

  console.log(s, errors);
})();
