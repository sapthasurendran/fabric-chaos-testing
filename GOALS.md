# Fabric Chaos Testing for the new Fabric Gateway
This will be a prototype environment that will test the new Fabric Gateway when unexpected things happen to the hyperledger fabric network. The kinds of things that can occur are

- loss of the gateway peer for any request
- loss of 1 or more peers in an org during submit endorsement
- loss of a whole org during submit endorsement
- loss of peers during evaluate
- loss of a single orderer but still maintaining concensus
- loss of the leader orderer
- loss of multiple orderers leading to loss of concensus

Testing this by hand or trying to automate testing which times the loss of access to peers and orderers is going to be time consuming and difficult, so this project is going to focus on producing an environment which runs for a period of time whilst causing chaos to the environment to see how it behaves. The chaos it will create will of course be defined so as to provide some sort of deterministic understanding of if something went wrong we know what it was and how did the system handle it. Also these chaos events will be done more than once to ensure we try to capture what may happen as many different possible variations occurring at the time.

So what do we need as a starting point

- A network to test against
- A Chaincode implementation
- A Client Application
- An external chaos creator
- A way to collate the results to show what happened (not sure we can explain the system state at the time because we cannot see what discovery is actually upto date at the time)

This would also reflect a more real world scenario when you just don't know when a connectivity issue or loss of peer/orderer will occur.

This testing is NOT about testing the resiliance of the peer/orderer to crashes such as OOM/Panics and coming back up at this time, so the making of peers/orderers unavailable will be done by pausing the process.

## Network required
This will need to be a network with
- at least 3 organisations
- each organisation has at least 2 peers
- a 5 orderer raft setup
- We do not need a CA, we can use cryptogen
- We do not need peer TLS certs but not a problem if we do
- We can use a system channel if we want, but latest test network doesn't use it
- We will have a single application channel

## Chaincode required
We will have some specialist chaincode
- we need a transaction that will emit chaincode events
- ???? we need a transaction that randomly crashes the chaincode process (if we use this then we lose the chaincode logs)
- we need a transaction that stores stuff on the ledger but won't cause an MVCC_READ_CONFLICT
- (optional) we could have a transaction that could cause an MVCC_READ_CONFLICT (with retry support in the client)
- we will need a transaction that runs for longer than usual
- outputs time started and time ended as part of it's response and to the chaincode logs as well
- evaluate txns
- submit txns
- need 2 using different chaincode ids
  - all orgs endorse
  - some orgs endorse


## Client Application required
We will need a long running application which
- is only for a single org (ie connects to a single gateway peer, it doesn't have to implement HA)
- we can run the same client for a different org simulaneously
- listens for chaincode events
- regularly sends submits and evaluates and the level of pressure it puts on the network is configurable
- delays between each send should be variable not fixed
- need to log start/end of endorse and start/end of commit
- client API currently has not timeouts, we may need our own timeouts to start

## External chaos creator
This will perform scripted chaos activities on a random basis. Script commands could be
- bring gateway/non-gateway peer down in defined org
- bring downed peer up
- bring orderer down
- bring downed orderer up
- random delay
- each command should write a log entry

We could then create a scenario script
- bring gateway peer down, delay, bring gateway peer up
- bring a non gateway peer down in an org that has to endorse, delay, bring peer up
- bring a non gateway peer down in an org that doesn't have to endorse, delay, bring peer up
-
.... TBD

We would then randomly (?) select a script to run sequentially at random times (ie ensure a delay before each chaos event)


## report generator
We take the chaos, peer/orderer/chaincode, client logs and collate a report that shows what happens when each of the chaos scenario scripts run

## Hope to capture

### Gateway Peer reliability
- Gateway Peer goes down and comes back up while app is up
  - No activity
  - In middle of activity
    - Waiting for all endorsements
    - Waiting for evaluate
    - Waiting for commit events
  - Events being listened for


### Submit reliability

4 Stages of Gateway Submit are
- endorsement policy determination and discover (cached ?)
- request endorsement against required orgs
- submit endorsement + signatures to orderer
- wait for commit event

What are the possible node availability issues
- Peer Issues
  - Can’t connect to some peers
  - Connectivity lost to requested peer resulting in no response, eg
    - Network problem
    - Peer/chaincode crash, eg OOM
  - Whole Org down
    - Org Mandatory
    - Can satisfy without Org
  - Can’t get enough endorsements as too many peers are unavailable
  - Gateway peer goes down after successful submission to orderer and waiting for event
- Orderer Issues
  - Orderer doesn’t return SUCCESS eg can’t forward to leader
  - Can’t connect to orderer(s)
     - Some, but can find an orderer to submit to and still can have concensus
     - Some, but not enough orderers for concensus
     - All
- Orderer doesn’t respond within a timeout
  - Network connectivity lost
  - Orderer crashes, eg OOM
Wait for commit event (1 Commit event in gateway peer) client decides on timeout
  Validation errors
  Losing events or no block cut, timeout ?

### Evaluate reliability
Only need to be concerned with the Peer node availability (Gateway Peer mainly I guess). Only a single peer is selected based on block height and will most likely be the gateway peer

### Chaincode Event Handling
Only need to be concerned with Gateway Peer