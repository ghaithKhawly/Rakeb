import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { loginSchema, registerSchema } from "src/schemas/auth";



export async function authRoutes(fastify: FastifyInstance) {
  
  fastify.post(
    "/register",
    { schema: registerSchema },
    async (request, reply) => {
      debugger
      try {
        const { username, password } = request.body as {
          username: string;
          password: string;
        };

        const userCheck = await fastify.pg.query(
          "SELECT id FROM users WHERE username = $1",
          [username]
        );

        if (userCheck.rows.length > 0) {
          return reply.code(400).send({ error: "Username already exists" });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const result = await fastify.pg.query(
          "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
          [username, passwordHash]
        );

        const user = result.rows[0];
        
        const token = fastify.jwt.sign({
          id: user.id,
          username: user.username
        });

        return reply.code(201).send({
          message: "User registered successfully",
          userId: user.id,
          token: token
        });
      } catch (error) {
        console.error("Registration error:", error);
        return reply.code(400).send({ error: "Internal server error" });
      }
    }
  );

  fastify.post(
    "/login",
    { schema: loginSchema },
    async (request, reply) => {
      try {
        const { username, password } = request.body as {
          username: string;
          password: string;
        };

        const result = await fastify.pg.query(
          "SELECT id, username, password_hash FROM users WHERE username = $1",
          [username]
        );

        if (result.rows.length === 0) {
          return reply.code(401).send({ error: "Invalid credentials" });
        }

        const user = result.rows[0];

        const isValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isValid) {
          return reply.code(401).send({ error: "Invalid credentials" });
        }

        const token = fastify.jwt.sign({
          id: user.id,
          username: user.username
        });

        return reply.send({
          message: "Login successful",
          token: token,
          user: {
            id: user.id,
            username: user.username
          }
        });
      } catch (error) {
        console.error("Login error:", error);
        return reply.code(401).send({ error: "Internal server error" });
      }
    }
  );

//   fastify.get(
//     "/me",
//     {
//       preHandler: [fastify.authenticate]
//     },
//     async (request, reply) => {
//       return {
//         user: request.user
//       };
//     }
//   );

//   fastify.post(
//     "/refresh",
//     {
//       preHandler: [fastify.authenticate]
//     },
//     async (request, reply) => {
//       const token = fastify.jwt.sign({
//         id: request.user.id,
//         username: request.user.username
//       });

//       return reply.send({
//         token: token
//       });
//     }
//   );
}