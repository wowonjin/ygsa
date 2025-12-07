const sseClients = new Set()

function broadcast(message) {
  const data = `data: ${JSON.stringify(message)}\n\n`
  for (const client of Array.from(sseClients)) {
    try {
      if (client.res.writableEnded) {
        sseClients.delete(client)
        continue
      }
      client.res.write(data)
    } catch (error) {
      console.warn('[sse] 전송 실패, 클라이언트를 제거합니다.', error)
      sseClients.delete(client)
      try {
        client.res.end()
      } catch (_) {}
    }
  }
}

function addClient(client) {
  sseClients.add(client)
}

function removeClient(client) {
  sseClients.delete(client)
}

module.exports = {
  broadcast,
  addClient,
  removeClient,
  getClientCount: () => sseClients.size,
}
