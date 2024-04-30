CREATE TABLE IF NOT EXISTS territories (
	id integer NOT NULL,
	category varchar NOT NULL,
	name varchar,
	geometry geometry,
	PRIMARY KEY(id)
);

CREATE INDEX territories_geom_idx ON territories USING GIST (geometry);

CREATE TABLE IF NOT EXISTS territories_grids (
	territory_id integer NOT NULL,
	grid_id integer NOT NULL,
	PRIMARY KEY (territory_id, grid_id),
	CONSTRAINT FK_territories_grids_territory FOREIGN KEY(territory_id) REFERENCES territories(id) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT FK_territories_grids_grid FOREIGN KEY(grid_id) REFERENCES grids(id) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO territories(id, category, name, geometry)
	SELECT
		id,
		key as category,
		string_val as name,
		geom as geometry
	FROM
		mapbiomas_biome;
		
INSERT INTO territories(id, category, name, geometry)
	SELECT
		id,
		key as category,
		string_val as name,
		geom as geometry
	FROM
		mapbiomas_country;

INSERT INTO territories(id, category, name, geometry)
	SELECT
		id,
		key as category,
		string_val as name,
		geom as geometry
	FROM
		mapbiomas_state;

INSERT INTO territories_grids (territory_id, grid_id)
	SELECT
		t.id as territory_id,
		g.id as grid_id
	FROM
		territories as t
		INNER JOIN grids as g
		ON ST_Intersects(t.geometry, g.geometry);

