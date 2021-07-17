import { protectedResolver } from './../../users/user.utils';
import { Resolvers } from '../../types';

const resolvers: Resolvers = {
  Mutation: {
    createSearchHistory: protectedResolver(
      async (_, { word }, { client, loggedInUser }) => {
        const exWord = await client.searchHistory.findFirst({
          where: { word, userId: loggedInUser.userId },
        });
        if (exWord) {
          // 이미 검색한 기록이 있을때 updateAt만 변경해줌
          await client.searchHistory.update({
            where: {
              id: exWord.id,
            },
            data: {
              word,
            },
          });
        } else {
          await client.searchHistory.create({
            data: {
              word,
              user: {
                connect: { userId: loggedInUser.userId },
              },
            },
          });
        }
        const count: number = await client.searchHistory.count({
          where: { userId: loggedInUser.userId },
        });
        if (count == 11) {
          // 검색 기록 개수가 10개가 되면 제일 오래된 값을 삭제함
          const { id } = await client.searchHistory.findFirst({
            where: { userId: loggedInUser.userId },
            select: { id: true },
          });
          await client.searchHistory.delete({ where: { id } });
        }
        return {
          ok: true,
        };
      }
    ),
  },
};

export default resolvers;