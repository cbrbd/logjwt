//node packets
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');

//mongoose models
const User = require('./models/newUser')
const RefreshToken = require('./models/refreshToken');

//middlewares
const CORS = require('./middleware/cors');
const verify = require('./middleware/verify');

//routes
const userRouter = require('./routes/user');

//functions
let {check} = require('./tool/password');

//config variables
let secret = require('./config.json');

const app = express();

require('./initDB')();

//middlewares used on every request
app.use(express.json()); //eq to bodyParser
app.use(CORS);
app.use('/api/user', userRouter);
app.use(express.static(path.join(__dirname, 'build')))


//function that generates the access tokens
function generateAccessToken(user){
    return jwt.sign({id:user.id, isAdmin:user.isAdmin}, secret.access, {expiresIn: "15m"});
}

//function that generates the refresh token
function generateRefreshToken(user) {
    return jwt.sign({id:user.id, isAdmin:user.isAdmin}, secret.refresh);
}



//Routes


//main route that serves front end from build folder
app.get('/', function(req, res){
    res.sendFile(path.join(__dirname, 'build', 'index.html'))
})


//POST HTTP method on path /api/refresh
//requires body: token: refreshToken
//Return a new pair of access/refresh token if valid
//requires body: token: refreshToken
app.post("/api/refresh",  async(req, res)=>{
    const refreshToken = req.body.token;
    //if no token, exit with 401 code
    if(!refreshToken){
        return res.status(401).json("You are not authenticated");
    } 
    try{
        //checks if DB contains a refreshToken with that value
        const refreshTokenDB = await RefreshToken.findOne({value: refreshToken}).exec();
        if(!refreshTokenDB){
            //if no identical token in DB, exit with code 403
            return res.status(403).json("JWT is not valid");
        } 
    } catch(error){
        console.log(error);
    }

    //if we reach this code, means that there is a valid param
    //verify the token
    jwt.verify(refreshToken, secret.refresh, async (err, user)=>{
        err && console.log("4 " + err);
        try{
            //delete previous token
            await RefreshToken.deleteOne({value: refreshToken}).exec();
            //generate a new pair
            const newAccessToken = generateAccessToken(user);
            const newRefreshToken = generateRefreshToken(user);
            //save new refresh in db
            const refreshTokenDB = new RefreshToken({value: newRefreshToken});
            refreshTokenDB.save(function(err){
                if(err){
                    console.log(err)
                }
            })
            //send to client
            res.status(200).json({
                accessToken: newAccessToken, refreshToken:  newRefreshToken
            })
        } catch (error){
            console.log(error);
        }

    })
})


//HTTP POST method on /api/loginJWT
//Allows a user to send a token and fetch info from it
//uses verify middleware
//requires : header:    authorization: Bearer accessToken
//           body:      token: accessToken     
app.post("/api/loginJWT", verify, async function(req, res){
    //if we reach this code, verify has successfully been executed, so accessToken is valid
    const accessToken = req.body.token;
    let userid = jwt.decode(accessToken).id;
    //fetch userId from accessToken
    try{
        //search user by id in database
        const user = await User.findById(userid).exec();
        if(user){
            //if user exists, send details
            res.status(200).json({
                user: {
                    username: user.username,
                    isAdmin: user.isAdmin
                }
            })
        } else {
            //if no user, send error 404
            res.status(404).json("User doesnt exist");
        }
    } catch (error){
        console.log(error);
    }
})


//HTTP POST method on route /api/login
//requires Body:    username: username, password: password
app.post("/api/login", async function(req, res){
    const {username, password} = req.body;
    try {
        const user = await User.findOne({username: username}).exec();

        //try to fetch user with param username
        // const user = await User.findOne({ username: username }).exec();
        //check if user exist and password matches
        if(user && (check(password, user.salt, user.hash))){
        // if(user && (user.password === password)){
            //generate token pair, save refresh in DB
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);
            const refreshTokenDB = new RefreshToken({value: refreshToken});
            refreshTokenDB.save(function(err){
                if(err) console.log(err);
            })
            //send user and tokens to client
            res.json({
                user:{
                    username: user.username,
                    isAdmin: user.isAdmin        
                },
                accessToken: accessToken,
                refreshToken: refreshToken
            })
        } else {
            res.status(400).json("username or password incorrect")
        }
    } catch (error) {
        console.log(error);
    }
})

//HTTP POST method on route /api/logout
//requires body: token : refreshToken
app.post("/api/logout", async (req, res) =>{
    const refreshToken = req.body.token;
    try{
        //delete token with specified value from DB
        await RefreshToken.deleteOne({value: refreshToken}).exec();
        res.status(200).json("successful logoutdb");
    } catch(error){
        res.status(500).json("an error happened, could not delete refreshToken with value" + refreshToken);
    }
})

 
//delete user method
//Run verify middleware,    then check if the user have right to delete another one
app.delete("/api/users/:userId", verify, (req, res) =>{
    //can only delete if admin or if you're trying to delete yourself
    if(req.user.id === req.params.userId || req.user.isAdmin){
        res.status(200).json("User has been deleted");
    } else {
        res.status(403).json("You are not allowed to delete this user");
    }
})


//route to make the app work with react router
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'))
  })

const PORT = 5000;
app.listen(PORT, ()=> console.log(  `running on http://127.0.0.1:${PORT}`))   