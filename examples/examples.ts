import * as io from 'io-ts';

import { Fetcher } from '../src/fetcher';

// EXAMPLES
(async () => {

  type User = { name: string };
  type FourTwoTwo = { code: number; correlationId: string };

  type GetUserResult =
    | { code: 200, payload: User[] }
    | { code: 400, payload: Error }
    | { code: 401, payload: [Error, string] }
    | { code: 422, payload: FourTwoTwo };

  const TUsers = io.array(io.type({ name: io.string }));
  const TFourTwoTwo = io.type({ code: io.number, correlationId: io.string });

  const [n, errors] = await new Fetcher<GetUserResult, string>('https://example.com')
    .handle(200, (users) => users.map((u) => u.name).join(', '), TUsers)
    .handle(400, (err) => err.message)
    .handle(
      422,
      ({ code, correlationId }) => `${code}: ${correlationId}`,
      TFourTwoTwo,
      // In this case we know that data is in headers and not in boy of the response.
      // For the sake of brewity I use non-null assertion here; in real code you should check for presence:
      async (res) => ({ code: +res.headers.get('x-code')!, correlationId: res.headers.get('x-correlation-id')! }),
    )
    .handle(401, ([err, permission]) => `You lack ${permission}. Also, ${err.message}`)
    .discardRestAsTo(() => '42')
    .map((s) => s.length)
    .run();

  console.log(n, errors);
})();
