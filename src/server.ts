import 'dotenv/config';
import { typeDefs, resolvers } from './schema';
import client from './client';
import * as http from 'http';
import * as express from 'express';
import logger from 'morgan';
import { ApolloServer } from 'apollo-server-express';
import { graphqlUploadExpress } from 'graphql-upload';
import { getUser } from './users/user.utils';

const PORT: string | undefined = process.env.PORT;
const apollo: ApolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  uploads: false,
  playground: false,
  introspection: false,
  context: async ({ req }) => {
    return {
      loggedInUser: await getUser(req.headers.token),
      client,
    };
  },
});

const app = express.default();

app.use(logger('tiny'));
app.use(graphqlUploadExpress());

apollo.applyMiddleware({ app });

const httpServer: http.Server = http.createServer(app);
apollo.installSubscriptionHandlers(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}/graphql`);
});
