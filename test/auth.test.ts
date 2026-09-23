import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateDemo,
  restoreDemo,
  users,
  allowedPages,
  homePath,
  resolvePage,
  initialTasksFor,
} from "../src/auth/users.ts";

test("all three demo accounts resolve to their own identity and home", () => {
  const homes = ["/app", "/app/department", "/app/employee"];
  users.forEach((user, index) => {
    assert.equal(authenticateDemo(user.username, "123456"), user);
    assert.equal(homePath(user.role), homes[index]);
    assert.equal(
      restoreDemo(JSON.stringify({ version: 1, username: user.username })),
      user,
    );
  });
});

test("unknown users and wrong passwords cannot authenticate", () => {
  assert.equal(authenticateDemo("Unknown", "123456"), null);
  assert.equal(authenticateDemo("JuliaSommer", "wrong"), null);
  assert.equal(authenticateDemo("JuliaSommer", ""), null);
});

test("restored profiles come from the canonical directory, never stored role claims", () => {
  assert.equal(
    restoreDemo(
      JSON.stringify({
        version: 1,
        username: "LukasHuber",
        role: "management",
      }),
    ),
    users[2],
  );
  for (const value of [
    null,
    "broken",
    "{}",
    '{"version":1,"username":"Unknown"}',
    '{"version":2,"username":"JuliaSommer"}',
  ]) {
    assert.equal(restoreDemo(value), null);
  }
});

test("employee routes cannot resolve management pages", () => {
  for (const page of ["analytics", "team", "processes"]) {
    assert.equal(resolvePage("employee", `/app/${page}`), "home");
  }
  assert.equal(resolvePage("employee", "/app/station"), "station");
  assert.equal(resolvePage("department_lead", "/app/analytics"), "analytics");
  assert.equal(allowedPages("employee").length, 6);
});

test("role task seeds are independent and department scoped", () => {
  for (const user of users.slice(1)) {
    const tasks = initialTasksFor(user);
    assert.ok(
      tasks.every(
        (task) => task.person === user.name && task.process === "packaging",
      ),
    );
    tasks[0].done = !tasks[0].done;
    assert.notEqual(tasks[0].done, initialTasksFor(user)[0].done);
  }
  assert.equal(initialTasksFor(users[2]).length, 5);
  assert.equal(initialTasksFor(users[2]).filter((task) => task.done).length, 1);
});
