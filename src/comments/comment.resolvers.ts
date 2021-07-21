import { Resolvers } from '../types';

const resolvers: Resolvers = {
  Comment: {
    isMine: ({ authorId }, _, { loggedInUser }) => {
      if (!loggedInUser) {
        return false;
      }
      return authorId === loggedInUser.userId;
    },
  },
};

export default resolvers;