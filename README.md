# caster
tarot

## work with docker
go to the folder you want to work in docker container and run
```
docker run -dit -v .:/usr/src/app --name caster sleavely/node-awscli:20.x
```
a docker container would be generated.

if you want to attach it, run
```
docker exec -it caster bash
```
