#!/usr/bin/env python

from common import db_connection

import sys

if len(sys.argv) != 3:
    print >> sys.stderr, "Usage: %s <PROJECT-ID> <USER-ID>"
    sys.exit(1)

project_id = int(sys.argv[1])
user_id = int(sys.argv[2])

c = db_connection.cursor()

for class_name in ('driver_line', 'cell_body_location'):
    c.execute("SELECT * FROM class WHERE project_id = %s AND class_name = %s",
              (project_id, class_name))
    if c.fetchall():
        print >> sys.stderr, "The class '%s' has already been inserted" % (class_name,)
    else:
        c.execute("INSERT INTO class (user_id, project_id, class_name) "+
                  "VALUES (%s, %s, %s)",
                  (user_id, project_id, class_name))

for relation_name in ('expresses_in', 'has_cell_body'):
    c.execute("SELECT * FROM relation WHERE project_id = %s AND relation_name = %s",
              (project_id, relation_name))
    if c.fetchall():
        print >> sys.stderr, "The relation '%s' has already been inserted" % (relation_name,)
    else:
        c.execute("INSERT INTO relation (user_id, project_id, relation_name) "+
                  "VALUES (%s, %s, %s)",
                  (user_id, project_id, relation_name))

db_connection.commit()
c.close()
db_connection.close()
