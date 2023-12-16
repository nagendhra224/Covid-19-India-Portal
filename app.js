const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => console.log("Server is Running"));
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const convertDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
    totalCases: dbObject.totalCases,
    totalCured: dbObject.totalCured,
    totalActive: dbObject.totalActive,
    totalDeaths: dbObject.totalDeaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    select * from user where username="${username}";`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched == true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const allStatesList = `
    select * from state;`;
  const stateArray = await db.all(allStatesList);
  response.send(
    stateArray.map((eachState) => convertDbObjectToResponseObject(eachState))
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getState = `
  select * from state
  where state_id=${stateId};`;
  const newState = await db.get(getState);
  response.send(convertDbObjectToResponseObject(newState));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const newDistrict = `
    insert into district (district_name,state_id,cases,cured,active,deaths)
    values("${districtName}",
    "${stateId}",
    "${cases}",
    "${cured}",
    "${active}",
    "${deaths}");`;
  const addDistrict = await db.run(newDistrict);
  const districtId = addDistrict.lastID;
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrict = `
    select * from 
    district
    where 
    district_id=${districtId};`;
    const districtDetails = await db.get(getDistrict);
    response.send(convertDbObjectToResponseObject(districtDetails));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `
  delete from district where
  district_id=${districtId};`;
    await db.run(deleteQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrict = `
  update district set
  district_name="${districtName}",
  state_id="${stateId}",
  cases=${cases},
  cured=${cured},
  active=${active},
  deaths=${deaths}
  where district_id=${districtId};`;
    await db.run(updateDistrict);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateReport = `
  select sum(cases) as totalCases,
  sum(cured) as totalCured,
  sum(active) as totalActive,
  sum(deaths) as totalDeaths
  from district 
  where state_id=${stateId};`;
    const stateReport = await db.get(getStateReport);
    response.send(stateReport);
  }
);

module.exports = app;
