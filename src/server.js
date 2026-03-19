const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('LAVIATHAN BOT IS RUNNING');
});

module.exports = { app, server, PORT };
