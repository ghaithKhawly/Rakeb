import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { loginSchema, promoteUserToDriverSchema, registerSchema } from "../schemas/auth";

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
          INSERT INTO users (username, password_hash, role)
          VALUES ($1, $2, 'rider')
          RETURNING id, role
          `,
          [username, passwordHash]
        );

        const userId = result.rows[0].id;
        const role = result.rows[0].role;

        const token = fastify.jwt.sign(
          { id: userId, username, role },
          { expiresIn: "7d" }
        );

        return reply.code(201).send({
          message: "User registered successfully",
          userId,
          role,
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
          "SELECT id, password_hash, role FROM users WHERE username = $1",
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
          { id: user.id, username, role: user.role },
          { expiresIn: "7d" }
        );

        return reply.code(200).send({
          message: "Login successful",
          token,
          user: {
            id: user.id,
            username,
            role: user.role
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

  fastify.post(
    "/admin/users/promote-driver",
    {
      preHandler: [fastify.authenticate],
      schema: promoteUserToDriverSchema,
    },
    async (request, reply) => {
      const actorPayload = request.user as { id?: number | string } | undefined;
      const actorId = Number(actorPayload?.id);

      if (!Number.isFinite(actorId)) {
        return reply.code(401).send({ error: "Unauthorized user payload" });
      }

      const body = request.body as { userId?: number; username?: string };
      const targetUserId = typeof body.userId === "number" ? body.userId : null;
      const targetUsername = typeof body.username === "string" ? body.username.trim() : null;

      const client = await fastify.pg.connect();

      try {
        const actorRes = await client.query<{ role: string | null }>(
          "SELECT role FROM users WHERE id = $1",
          [actorId],
        );

        if (actorRes.rows.length === 0) {
          return reply.code(401).send({ error: "Unauthorized user payload" });
        }

        const actorRole = actorRes.rows[0].role;
        if (actorRole !== "admin") {
          return reply.code(403).send({ error: "Admin role required" });
        }

        const targetRes = await client.query<{ id: number; username: string; role: string | null }>(
          `
          SELECT id, username, role
          FROM users
          WHERE ($1::int IS NOT NULL AND id = $1)
             OR ($2::text IS NOT NULL AND username = $2)
          ORDER BY id ASC
          LIMIT 1
          `,
          [targetUserId, targetUsername],
        );

        if (targetRes.rows.length === 0) {
          return reply.code(404).send({ error: "Target user not found" });
        }

        const target = targetRes.rows[0];
        if (target.role === "driver") {
          return reply.code(200).send({
            message: "User is already a driver",
            user: {
              id: target.id,
              username: target.username,
              role: "driver",
            },
          });
        }

        const updatedRes = await client.query<{ id: number; username: string; role: string }>(
          `
          UPDATE users
          SET role = 'driver',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, username, role
          `,
          [target.id],
        );

        return reply.code(200).send({
          message: "User promoted to driver",
          user: updatedRes.rows[0],
        });
      } catch (error) {
        request.log.error({ error }, "Failed to promote user to driver");
        return reply.code(500).send({ error: "Internal server error" });
      } finally {
        client.release();
      }
    },
  );
}