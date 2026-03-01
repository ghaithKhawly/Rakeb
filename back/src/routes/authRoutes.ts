import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { registerSchema, loginSchema } from "../schemas/auth";

export async function authRoutes(fastify: FastifyInstance) {

  fastify.post(
    "/register",
    { schema: registerSchema },
    async (request, reply) => {

      const { username, password } = request.body as {
        username: string;
        password: string;
      };

      const client = await fastify.pg.connect();

      try {
        const existingUser = await client.query(
          "SELECT id FROM users WHERE username = $1",
          [username]
        );

        if (existingUser.rows.length > 0) {
          return reply.code(400).send({
            error: "Username already exists"
          });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await client.query(
          `
          INSERT INTO users (username, password_hash)
          VALUES ($1, $2)
          RETURNING id
          `,
          [username, passwordHash]
        );

        const userId = result.rows[0].id;

        const token = fastify.jwt.sign(
          { id: userId, username },
          { expiresIn: "7d" }
        );

        return reply.code(201).send({
          message: "User registered successfully",
          userId,
          token
        });

      } catch (error) {
        console.error(error);
        return reply.code(500).send({
          error: "Internal server error"
        });
      } finally {
        client.release();
      }
    }
  );

  fastify.post(
    "/login",
    { schema: loginSchema },
    async (request, reply) => {

      const { username, password } = request.body as {
        username: string;
        password: string;
      };

      const client = await fastify.pg.connect();

      try {
        const result = await client.query(
          "SELECT id, password_hash FROM users WHERE username = $1",
          [username]
        );

        if (result.rows.length === 0) {
          return reply.code(401).send({
            error: "Invalid credentials"
          });
        }

        const user = result.rows[0];

        const isValid = await bcrypt.compare(
          password,
          user.password_hash
        );

        if (!isValid) {
          return reply.code(401).send({
            error: "Invalid credentials"
          });
        }

        const token = fastify.jwt.sign(
          { id: user.id, username },
          { expiresIn: "7d" }
        );

        return reply.code(200).send({
          message: "Login successful",
          token,
          user: {
            id: user.id,
            username
          }
        });

      } catch (error) {
        console.error(error);
        return reply.code(500).send({
          error: "Internal server error"
        });
      } finally {
        client.release();
      }
    }
  );
}