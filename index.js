import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';  // Importa a função fileURLToPath
import { dirname } from 'path';       // Importa a função dirname
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Pedra, Papel e Tesoura 🪨 📜 ✂️
const pptNamespace = io.of('/pedra-papel-tesoura');
const rooms = {};

pptNamespace.on('connection', (socket) => {
    const playerName = socket.handshake.query.playerName;

    socket.on('joinGame', () => {
        let roomId = null;

        // Encontra uma sala vazia ou cria uma nova
        for (let room in rooms) {
            if (rooms[room].length < 2) {
                roomId = room;
                break;
            }
        }

        if (!roomId) {
            roomId = `room-${Math.random().toString(36).substr(2, 9)}`;
            rooms[roomId] = [];
        }

        rooms[roomId].push({ id: socket.id, name: playerName });
        socket.join(roomId);

        // Verifica se a sala tem 2 jogadores e inicia o jogo
        if (rooms[roomId].length === 2) {
            pptNamespace.to(roomId).emit('startGame', rooms[roomId]);
        }

        socket.on('gameMove', (move) => {
            // Encontra a sala do jogador
            const roomId = Object.keys(rooms).find((room) =>
                rooms[room].some((player) => player.id === socket.id)
            );

            if (!roomId) {
                console.log('Sala não encontrada para o jogador.');
                return;
            }

            const room = rooms[roomId];
            room.moves = {};

            const player = room.find((p) => p.id === socket.id);
            if (player) {
                player.move = move;
            }

            if (room.every((p) => p.move)) {
                const [player1, player2] = room;
                const result = determineWinner(player1.move, player2.move);

                const gameResults = {
                    [player1.id]: result,
                    [player2.id]: result === 'win' ? 'lose' : result === 'lose' ? 'win' : 'draw',
                };

                room.forEach((player) => {
                    const resultEvent = gameResults[player.id];
                    const opponentMove = room.find((p) => p.id !== player.id).move;

                    if (resultEvent === 'win') {
                        pptNamespace.to(player.id).emit('win', { opponentMove });
                    } else if (resultEvent === 'lose') {
                        pptNamespace.to(player.id).emit('lose', { opponentMove });
                    } else {
                        pptNamespace.to(player.id).emit('draw', { opponentMove });
                    }
                });

                const msg = `${player1.name} escolheu ${getEmoji(player1.move)} \n ${player2.name} escolheu ${getEmoji(player2.move)}`;
                pptNamespace.to(roomId).emit('log', msg);

                // Reseta a sala para a próxima rodada
                room.forEach((player) => {
                    delete player.move;
                });
            }
        });

        socket.on('disconnect', () => {
            // Notifica o outro jogador na sala
            pptNamespace.to(roomId).emit('playerDisconnected', 'Seu oponente desconectou.');

            // Remove a sala e desconecta os sockets remanescentes
            const room = pptNamespace.adapter.rooms.get(roomId);
            if (room) {
                room.forEach((id) => {
                    const otherSocket = pptNamespace.sockets.get(id);
                    if (otherSocket) {
                        otherSocket.disconnect(true); // Desconecta o socket
                    }
                });
            }

            delete rooms[roomId];
        });
    });

    function determineWinner(move1, move2) {
        const m1 = parseInt(move1, 10);
        const m2 = parseInt(move2, 10);

        // Regras: Pedra (0) > Tesoura (2), Tesoura (2) > Papel (1), Papel (1) > Pedra (0)
        if (m1 === m2) {
            return 'draw';
        }
        if ((m1 === 0 && m2 === 2) || (m1 === 1 && m2 === 0) || (m1 === 2 && m2 === 1)) {
            return 'win';
        }
        return 'lose';
    }

    function getEmoji(number) {
        if(number == 0) return `PEDRA(🪨)`;
        if(number == 1) return `PAPEL (📄)`;
        if(number == 2) return `TESOURA (✂️)`;
    }

});

const chatNameSpace = io.of('/chat');
chatNameSpace.on('connection', (socket) => {

    // Evento para mensagens enviadas pelos usuários
    socket.on('sendMessage', (data) => {
        chatNameSpace.emit('receiveMessage', data);
    });

    socket.on('disconnect', () => {
        chatNameSpace.emit('receiveMessage', `${socket.id} se desconectou`);
    });

});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on xD http://localhost:${PORT}`);
});
