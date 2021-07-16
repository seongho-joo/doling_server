import { gql } from 'apollo-server-express';

export default gql`
  type User {
    userId: Int!
    username: String!
    fullName: String!
    password: String!
    phoneNumber: String!
    location: String
    avatar: String
    email: String!
    searchHistories: [SearchHistory]
    createdAt: String!
    updatedAt: String!
  }
`;
