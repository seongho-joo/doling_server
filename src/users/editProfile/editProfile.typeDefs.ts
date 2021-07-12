import { gql } from 'apollo-server-express';

export default gql`
  type Mutation {
    editProfile(
      userId: Int!
      useranme: String
      location: String
    ): MutationResponse!
  }
`;