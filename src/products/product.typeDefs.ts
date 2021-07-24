import { gql } from 'apollo-server-express';

export default gql`
  type Product {
    id: Int!
    author: User!
    title: String!
    price: Int!
    picture: [String]
    hashtags: [Hashtag]
    hits: Int!
    isMine: Boolean!
    content: String
    comments: [Comment]
    createdAt: String!
    updatedAt: String!
  }

  type Hashtag {
    id: Int!
    hashtag: String!
    products(page: Int!): [Product]
    totalPhotos: Int
    createdAt: String!
    updatedAt: String!
  }
`;
