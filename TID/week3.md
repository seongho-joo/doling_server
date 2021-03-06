# 7/15

## AWS s3를 이용해서 프로필 사진 업로드
- graphql Upload Setting
```ts
import { graphqlUploadExpress } from 'graphql-upload'; // 추가

const apollo: ApolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  uploads: false, // 추가
  playground: true,
  introspection: true,
  context: async ({ req }) => {

app.use(graphqlUploadExpress());
```
파일 업로드를 진행하려고 했을때 `POST body missing. Did you forget use body-parser middleware`라는 에러가 떠서 뭐가 문제인지 검색을 하니 `app.use(graphqlUploadExpress());` 미들웨어를 사용하겠다는 것을 작성하지 않아서 에러가 떴었음

```ts
import * as AWS from 'aws-sdk';
import { File } from '../types';

AWS.config.update({
  credentials: {
    accessKeyId: process.env.AWS_S3_KEY,
    secretAccessKey: process.env.AWS_S3_SECRET,
  },
});

export const uploadToS3 = async (
  file: File,
  userId: number,
  dirName: string
) => {
  const { filename, createReadStream } = await file;
  const readStream = createReadStream();
  const objectName: string = `${dirName}/${userId}_${Date.now()}_${filename}`;
  const { Location } = await new AWS.S3()
    .upload({
      Bucket: 'timebridge-uploads',
      Key: objectName,
      ACL: 'public-read',
      Body: readStream,
    })
    .promise();
  return Location;
};
```
- 코드를 작성 후 테스트를 진행할때 업로드가 안됐었는데 알고보니 버킷을 잘목 입력했었음

# 7/16

## 검색 기록 모델 생성

`schema.prisma`
```
model User {
  userId          Int             @id @default(autoincrement())
  fullName        String
  username        String          @unique
  avatar          String?
  email           String          @unique
  password        String
  phoneNumber     String          @unique
  location        String?
  notifications   Notification[]
  searchHistories SearchHistory[] // 추가
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

model SearchHistory {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [userId])
  word      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```
`user.typeDefs.ts`
```graphql
type User {
    userId: Int!
    username: String!
    fullName: String!
    password: String!
    phoneNumber: String!
    location: String
    avatar: String
    email: String!
    searchHistories: [SearchHistory] // 추가
    createdAt: String!
    updatedAt: String!
  }
```
- 사용자와 검색 기록 관계를 one to many로 해야할지 many to many로 해야할지 잘 모르겠음
- ~~태경왈 : many to many는 잘 안쓰기도 하고 관리도 어렵다. 킹지만 관리를 잘한다면 뭐를 해도 상관없음~~
- 일단 one to many로 생성함

## 검색 기록 생성

- `typeDefs`
```ts
type Mutation {
  createSearchHistory(word: String!): MutationResponse!
}
```
- `resolver`
```Ts
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
```
```ts
await client.searchHistory.update({
  where: {
    id: exWord.id,
  },
  data: {
    updateAt: Date.now(),
  },
```
- 한 사용자가 같은 검색어를 검색했을때 `updateAt`을 위 코드와 같이 업데이트를 진행하려고 했으나 타입이 호환되지 않아 검색어를 업데이트하여 `updateAt`을 갱신함

## 검색 기록 리스트 보기

- `typeDef`
```ts
type Query {
    seeSearchHistory: [SearchHistory]
}
```
- `resolvers`
```ts
const resolvers: Resolvers = {
  Query: {
    seeSearchHistory: protectedResolver(
      async (_, __, { client, loggedInUser }) =>
        client.searchHistory.findMany({
          where: { userId: loggedInUser.userId },
          orderBy: { updatedAt: 'desc' },
        })
    ),
  },
};
```
- 최근 업데이트된 순서로 목록을 나타냄

## 검색 기록 삭제

- `typeDefs`
  ```ts
  type Mutation {
    deleteSearchHistory(id: Int!): MutationResponse!
  }
  ```
- `resolvers`
  ```ts
  const resolvers: Resolvers = {
    Mutation: {
      deleteSearchHistory: protectedResolver(async (_, { id }, { client }) => {
        const exHistory = await client.searchHistory.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!exHistory) {
          return {
            ok: false,
            error: '검색 기록을 찾을 수 없습니다.',
          };
        }
        await client.searchHistory.delete({ where: { id } });
        return { ok: true };
      }),
    },
  };
  ```

# 7/17
## 알림 생성
```ts
  // typeDefs
  type Mutation {
    insertNotification(
      userId: Int!
      title: String!
      content: String!
    ): MutationResponse!
  }
// resolvers
const resolvers: Resolvers = {
  Mutation: {
    insertNotification: async (_, { userId, title, content }, { client }) => {
      const exUser = await client.user.findUnique({
        where: { userId },
        select: { userId: true },
      });
      if (!exUser) {
        return {
          ok: false,
          error: '유저가 존재하지 않음',
        };
      }
      await client.notification.create({
        data: {
          user: {
            connect: { userId },
          },
          title,
          content,
        },
      });
      return { ok: true };
    },
  },
};
```
- front에서 Android, iOS push 알림 api 구현이 필요함
- api는 FCM, kakao가 있음
- DB에 디바이스 정보 필드를 만들어야 하는지 잘 모르겠음
- 보통 어플 알림 설정에 여러 알림들을 on off를 하는게 있는데 이걸 db에 넣어야되는지 회의가 필요(~~태경이형 카톡~~)

## 알림 목록 보기
```ts
type Query {
  seeNotifications(lastId: Int): [Notification]
}

const resolvers: Resolvers = {
  Query: {
    seeNotifications: protectedResolver(
      async (_, { lastId }, { client, loggedInUser }) => {
        const { userId } = loggedInUser;
        return await client.notification.findMany({
          where: { userId },
          take: 10,
          skip: lastId ? 1 : 0,
          ...(lastId && { cursor: { id: lastId } }),
        });
      }
    ),
  },
};
```
- 알림 목록은 page가 필요없기 때문에 cursor-base pagination으로 구현을 함
- ~~이번에 노마드 강의를 다시 보고 pagination에 대해서 이해 했음~~

# 7/18

### 알림 삭제
```ts
type Mutation {
  deleteNotification(id: Int!): MutationResponse!
}

const resolvers: Resolvers = {
  Mutation: {
    deleteNotification: protectedResolver(async (_, { id }, { client }) => {
      const exNotifi = await client.notification.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exNotifi) {
        return {
           ok: false,
          error: '알림을 찾을 수 없음',
        };
      }
      await client.notification.delete({
         where: { id },
      });
      return { ok: true };
    }),
  },
};
```

# 7/19

### Product, Hashtag 테이블 추가
- 우선 최소한 필요한 필드만 작성함

### 물품 등록 및 상세 보기
```ts
type uploadProductResult {
  ok: Boolean!
  error: String
  product: Product
}
type Mutation {
  uploadProduct(
    title: String!
    price: Int!
    hashtags: [String]
    pictures: [Upload]
    content: String
  ): uploadProductResult!
}

const resolvers: Resolvers = {
  Mutation: {
    uploadProduct: protectedResolver(
      async (
        _,
        { title, price, pictures, content, hashtags },
        { client, loggedInUser }
      ) => {
        let picturesUrl: string[] = [];
        if (pictures) {
          picturesUrl = await Promise.all(
            pictures.map(async (item: File) => {
              const location: string = await uploadToS3(
                item,
                loggedInUser.userId,
                title,
                loggedInUser.username,
                'products'
              );
              return location;
            })
          );
        }
        let hashtagObj = [];
        if (hashtags) {
          hashtagObj = hashtags.map((item: string) => ({
            where: { hashtag: item },
            create: { hashtag: item },
          }));
        }
        const product: Product = await client.product.create({
          data: {
            title,
            author: {
              connect: { userId: loggedInUser.userId },
            },
            content,
            ...(picturesUrl && { picture: picturesUrl }),
            price,
            ...(hashtagObj.length > 0 && {
              hashtags: { connectOrCreate: hashtagObj },
            }),
          },
        });
        return {
          ok: true,
          product,
        };
      }
    ),
  },
};
```
- 사진은 AWS S3에 올림
- 물품 등록 테스트 중 `picture` 필드의 값을 받으면 `Upload serialization unsupported` 라는 GraphQL Error가 떴었음
- 오류가 떴던 이유는 `Product` 타입 중 `picture` 필드의 리턴값이 [String] 이었어야했는데 확인 해보니 [Upload]로 되어있어서 [String]으로 고친 후 해결함

```ts
type Query {
  seeProduct(id: Int!): Product!
}

const resolvers: Resolvers = {
  Query: {
    seeProduct: (_, { id }, { client }) =>
      client.product.findUnique({ where: { id } }),
  },
};
``` 

### S3 여러 오브젝트 삭제 및 물품 삭제 구현
```ts
export const deleteObjectsS3 = async (param: DeleteObjectsRequest) => {
  const { Errors } = await new AWS.S3().deleteObjects(param).promise();
  if (Errors.length !== 0) {
    throw Errors;
  }
};
```

```ts
type Mutation {
  deleteProduct(id: Int!): MutationResponse!
}

const resolvers: Resolvers = {
  Mutation: {
    deleteProduct: protectedResolver(
      async (_, { id }, { client, loggedInUser }) => {
        const exProduct: Product = await client.product.findUnique({
          where: { id },
        });
        if (!exProduct) {
          return {
            ok: false,
            error: '물품이 존재하지 않음',
          };
        }
        if (exProduct.authorId !== loggedInUser.userId) {
          return {
            ok: false,
            error: '권한이 없음',
          };
        }
        if (exProduct.picture) {
          let files: string[];
          files = exProduct.picture;
          const Objects = await Promise.all(
            files.map(async (item: string) => {
              const keyName: string[] = item.split(
                'https://timebridge-uploads.s3.amazonaws.com/'
              );
              return {
                Key: keyName[1],
              };
            })
          );
          const param: DeleteObjectsRequest = {
            Bucket: 'timebridge-uploads',
            Delete: {
              Objects,
            },
          };
          await deleteObjectsS3(param);
        }
        await client.product.delete({ where: { id } });
        return { ok: true };
      }
    ),
  },
};
```
- 전에 만들었던 단일 오브젝트 삭제를 `foreach`를 사용해서 `picture`의 값을 하나씩 삭제하려고 헀으나 AWS쪽에서 Key에 대해서 에러가 발생함
- 단일 오브젝트 대신 여러 오브젝트 삭제를 이용해 에러를 해결함

# 7/20

### 리스트 보기
```ts
type Query {
  seeFeed(lastId: Int): [Product]
}

const resolvers: Resolvers = {
  Query: {
    seeFeed: (_, { lastId }, { client }) =>
      client.product.findMany({
        take: 10,
        skip: lastId ? 1 : 0,
        ...(lastId && { cursor: { id: lastId } }),
        orderBy: { updatedAt: 'desc' },
      }),
  },
};
```
- 정렬 순서를 정해야함

### 조회수 추가
```ts
const resolvers: Resolvers = {
  Mutation: {
    seeProduct: async (_, { id }, { client }) => {
      const exProduct: Product = await client.product.findUnique({
        where: { id },
      });
      if (!exProduct) {
        return null;
      }
      return await client.product.update({
        where: { id },
        data: { hits: exProduct.hits + 1 },
      });
    },
  },
};

```

### 댓글 작성
```ts
type Mutation {
  createComment(productId: Int!, commment: String!): MutationResponse!
}

const resolvers: Resolvers = {
  Mutation: {
    createComment: protectedResolver(
      async (_, { productId, comment }, { loggedInUser, client }) => {
        const { userId } = loggedInUser;
        const product: Identity = await client.product.findUnique({
          where: { id: productId },
          select: { id: true },
        });

        if (!product) {
          return {
            ok: false,
            error: '게시글이 존재하지 않음',
          };
        }

        const newComment: Comment = await client.comment.create({
          data: {
            comment,
            author: {
              connect: { userId },
            },
            product: {
              connect: { id: productId },
            },
          },
        });
        return { ok: true };
      }
    ),
  },
};
```
- `Invalid 'prisma.comment.create()' invocation` error 발생 
```
`undefined`를 requried 필드에 넣으면 발생하는 오류
```
- 원인이 뭔지 몰라서 prisma 깃에 Issues와 stackoverflow에 질문 남겨놓음
- ~~시발~~ typeDefs 매개변수 `commment` 오타 수정 후 해결